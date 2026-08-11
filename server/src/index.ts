/// <reference types="@cloudflare/workers-types" />

interface Env {
	DESC_DATA: KVNamespace;
}

const ROUTE_GENERATE_HASH = '/api/generate-reset-hash';
const ROUTE_CHANGE_ADMIN_EMAIL = '/api/change-admin-email';
const ROUTE_SEND_ADMIN_CHANGE_CODE = '/api/send-admin-email-change-code';
const ROUTE_CHANGE_FROM_EMAIL = '/api/change-from-email';
const ROUTE_UPLOAD_ID = '/api/upload-id';
const ROUTE_DOWNLOAD = '/api/download';
const TOKEN_CHANGE_RATE_LIMIT_MS = 10 * 60 * 1000;
const ADMIN_CHANGE_CODE_RATE_LIMIT_MS = 60 * 1000;
const ADMIN_CHANGE_CODE_TTL_MS = 10 * 60 * 1000;
const PAYLOAD_MAX_BYTES = 8 * 1024 * 1024; // 上传 payload 大小上限 8MB
const REQUEST_BODY_MAX_BYTES = 16 * 1024 * 1024; // 请求体大小上限 16MB
const DATA_MAX_BYTES = 200; // data 标识长度上限（字节），保证 KV 键远低于 512 字节上限

interface RateLimitRule {
	windowMs: number;
	max: number;
}

// 写接口按客户端（IP 优先，无 IP 时退化为 token）的滑动窗口限流
const WRITE_RATE_LIMITS: Record<string, RateLimitRule> = {
	[ROUTE_CHANGE_ADMIN_EMAIL]: { windowMs: 60 * 1000, max: 5 },
	[ROUTE_CHANGE_FROM_EMAIL]: { windowMs: 60 * 1000, max: 5 },
	[ROUTE_UPLOAD_ID]: { windowMs: 60 * 1000, max: 60 },
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// CORS 预检请求
		if (request.method === 'OPTIONS') {
			const origin = await getCorsOrigin(env);
			return new Response(null, { status: 204, headers: corsHeaders(origin) });
		}

		let response: Response;
		if (url.pathname === ROUTE_GENERATE_HASH && request.method === 'POST') {
			response = await handleGenerateResetHash(request, env);
		} else if (url.pathname === ROUTE_CHANGE_ADMIN_EMAIL && request.method === 'POST') {
			response = await handleChangeAdminEmail(request, env);
		} else if (url.pathname === ROUTE_SEND_ADMIN_CHANGE_CODE && request.method === 'POST') {
			response = await handleSendAdminChangeCode(request, env);
		} else if (url.pathname === ROUTE_CHANGE_FROM_EMAIL && request.method === 'POST') {
			response = await handleChangeFromEmail(request, env);
		} else if (url.pathname === ROUTE_UPLOAD_ID && request.method === 'POST') {
			response = await handleUpload(request, env, url);
		} else if (url.pathname === ROUTE_DOWNLOAD && request.method === 'GET') {
			response = await handleDownload(request, env, url);
		} else {
			response = new Response('Not Found', { status: 404 });
		}

		// 统一附加 CORS 头
		const origin = await getCorsOrigin(env);
		const headers = new Headers(response.headers);
		for (const [name, value] of Object.entries(corsHeaders(origin))) {
			headers.set(name, value);
		}
		return new Response(response.body, { status: response.status, headers });
	},

	async scheduled(_controller: any, env: Env, _ctx: ExecutionContext): Promise<void> {
		await handleScheduled(env);
	},
} satisfies ExportedHandler<Env>;

async function handleGenerateResetHash(request: Request, env: Env): Promise<Response> {
	const adminEmail = await env.DESC_DATA.get('admin_email');
	const resendApiKey = await env.DESC_DATA.get('resend_api_key');
	const resendFrom = await env.DESC_DATA.get('resend_from');

	if (!adminEmail) {
		return jsonResponse({ error: 'Admin email is not configured in KV' }, 500);
	}

	if (!resendApiKey) {
		return jsonResponse({ error: 'Resend API Key is not configured in KV' }, 500);
	}

	if (!resendFrom) {
		return jsonResponse({ error: 'Resend sender address is not configured in KV' }, 500);
	}

	const bodyResult = await parseJsonBody(request);
	if (!bodyResult.ok) {
		return bodyErrorResponse(bodyResult);
	}
	const body = bodyResult.body;
	const providedToken = String(body?.token ?? body?.old_token ?? '');
	const currentTokenHash = await getStoredTokenHash(env);
	const currentTokenTime = await env.DESC_DATA.get('token_replace_time');
	const rotateDays = await getTokenRotateDays(env);
	const tokenIsActive = isTokenStillActive(currentTokenTime, rotateDays);

	if (isTokenChangeRateLimited(currentTokenTime)) {
		return jsonResponse({ error: 'Token change is rate limited, please try again in 10 minutes' }, 429);
	}

	if (tokenIsActive && currentTokenHash) {
		if (!providedToken) {
			return jsonResponse({ error: 'Current token is still valid, provide the old token to rotate' }, 403);
		}

		if (!(await isTokenValid(providedToken, currentTokenHash))) {
			auditLog('token_rotate_denied', { reason: 'invalid_old_token', ip: getClientIp(request) });
			return jsonResponse({ error: 'Old token verification failed' }, 403);
		}
	}

	const token = generateSecureToken();
	const tokenHash = await sha256Hex(token);
	const tokenReplaceTime = new Date().toISOString();

	// 新 token 直接覆盖旧值，旧 token 随即失效（可重用 token 仅在轮换后失效）
	await Promise.all([
		env.DESC_DATA.put('token_hash', tokenHash),
		env.DESC_DATA.put('token_replace_time', tokenReplaceTime),
	]);

	const emailSent = await sendResetTokenEmail(adminEmail, token, resendApiKey, resendFrom);
	if (!emailSent.ok) {
		const bodyText = await safeReadResponseBody(emailSent);
		return jsonResponse({ error: 'Failed to send email', details: bodyText }, 502);
	}

	auditLog('token_rotated', { ip: getClientIp(request) });
	return jsonResponse({ success: true, message: 'Reset hash generated and sent to the admin email' });
}

async function handleChangeAdminEmail(request: Request, env: Env): Promise<Response> {
	const bodyResult = await parseJsonBody(request);
	if (!bodyResult.ok) {
		return bodyErrorResponse(bodyResult);
	}
	const body = bodyResult.body;

	const token = String(body.token ?? '');
	const newAdminEmail = String(body.new_admin_email ?? '');
	const code = String(body.code ?? '');

	if (!token || !newAdminEmail || !code) {
		return jsonResponse({ error: 'token, new_admin_email and code are required' }, 400);
	}

	if (!validateEmail(newAdminEmail)) {
		return jsonResponse({ error: 'new_admin_email is not a valid email' }, 400);
	}

	const tokenHash = await getStoredTokenHash(env);
	if (!tokenHash) {
		return jsonResponse({ error: 'No valid token has been generated' }, 403);
	}

	if (!(await isTokenValid(token, tokenHash))) {
		auditLog('unauthorized_write', { route: ROUTE_CHANGE_ADMIN_EMAIL, reason: 'invalid_token', ip: getClientIp(request) });
		return jsonResponse({ error: 'Token verification failed' }, 403);
	}

	// 限流放在验证码校验之前，同时防止对 6 位验证码的暴力枚举
	if (await isWriteRateLimited(request, env, ROUTE_CHANGE_ADMIN_EMAIL, token)) {
		auditLog('rate_limited', { route: ROUTE_CHANGE_ADMIN_EMAIL, ip: getClientIp(request) });
		return jsonResponse({ error: 'Too many requests, please try again later' }, 429);
	}

	const storedCode = await env.DESC_DATA.get('admin_email_change_code');
	const storedCodeTime = await env.DESC_DATA.get('admin_email_change_code_time');
	if (!isAdminChangeCodeValid(storedCode, storedCodeTime, code)) {
		auditLog('admin_change_denied', { reason: 'invalid_code', ip: getClientIp(request) });
		return jsonResponse({ error: 'Verification code is invalid or expired' }, 403);
	}

	// 验证码使用后立即清除，防止重复使用
	await Promise.all([
		env.DESC_DATA.put('admin_email', newAdminEmail),
		env.DESC_DATA.delete('admin_email_change_code'),
		env.DESC_DATA.delete('admin_email_change_code_time'),
	]);

	auditLog('admin_email_changed', { newEmail: newAdminEmail, ip: getClientIp(request) });
	return jsonResponse({ success: true, message: 'Admin email updated' });
}

// Send a verification code to the current admin email before changing it
async function handleSendAdminChangeCode(request: Request, env: Env): Promise<Response> {
	const bodyResult = await parseJsonBody(request);
	if (!bodyResult.ok) {
		return bodyErrorResponse(bodyResult);
	}
	const body = bodyResult.body;

	const token = String(body.token ?? '');
	if (!token) {
		return jsonResponse({ error: 'token is required' }, 400);
	}

	const tokenHash = await getStoredTokenHash(env);
	if (!tokenHash) {
		return jsonResponse({ error: 'No valid token has been generated' }, 403);
	}
	if (!(await isTokenValid(token, tokenHash))) {
		auditLog('unauthorized_write', { route: ROUTE_SEND_ADMIN_CHANGE_CODE, reason: 'invalid_token', ip: getClientIp(request) });
		return jsonResponse({ error: 'Token verification failed' }, 403);
	}

	const adminEmail = await env.DESC_DATA.get('admin_email');
	const resendApiKey = await env.DESC_DATA.get('resend_api_key');
	const resendFrom = await env.DESC_DATA.get('resend_from');
	if (!adminEmail || !resendApiKey || !resendFrom) {
		return jsonResponse({ error: 'Admin email or mail configuration is not configured in KV' }, 500);
	}

	const lastCodeTime = await env.DESC_DATA.get('admin_email_change_code_time');
	if (isAdminChangeCodeRateLimited(lastCodeTime)) {
		auditLog('rate_limited', { route: ROUTE_SEND_ADMIN_CHANGE_CODE, ip: getClientIp(request) });
		return jsonResponse({ error: 'Verification code sent too frequently, please try again in 1 minute' }, 429);
	}

	const code = generateVerificationCode();
	const codeTime = new Date().toISOString();

	await Promise.all([
		env.DESC_DATA.put('admin_email_change_code', code),
		env.DESC_DATA.put('admin_email_change_code_time', codeTime),
	]);

	const emailSent = await sendAdminChangeCodeEmail(adminEmail, code, resendApiKey, resendFrom);
	if (!emailSent.ok) {
		const bodyText = await safeReadResponseBody(emailSent);
		return jsonResponse({ error: 'Failed to send email', details: bodyText }, 502);
	}

	auditLog('admin_code_sent', { to: adminEmail, ip: getClientIp(request) });
	return jsonResponse({ success: true, message: 'Verification code sent to the current admin email' });
}

async function handleChangeFromEmail(request: Request, env: Env): Promise<Response> {
	const bodyResult = await parseJsonBody(request);
	if (!bodyResult.ok) {
		return bodyErrorResponse(bodyResult);
	}
	const body = bodyResult.body;

	const token = String(body.token ?? '');
	const newFromEmail = String(body.new_from_email ?? '');

	if (!token || !newFromEmail) {
		return jsonResponse({ error: 'token and new_from_email are required' }, 400);
	}

	if (!validateEmail(newFromEmail)) {
		return jsonResponse({ error: 'new_from_email is not a valid email' }, 400);
	}

	const tokenHash = await getStoredTokenHash(env);
	if (!tokenHash) {
		return jsonResponse({ error: 'No valid token has been generated' }, 403);
	}

	if (!(await isTokenValid(token, tokenHash))) {
		auditLog('unauthorized_write', { route: ROUTE_CHANGE_FROM_EMAIL, reason: 'invalid_token', ip: getClientIp(request) });
		return jsonResponse({ error: 'Token verification failed' }, 403);
	}

	if (await isWriteRateLimited(request, env, ROUTE_CHANGE_FROM_EMAIL, token)) {
		auditLog('rate_limited', { route: ROUTE_CHANGE_FROM_EMAIL, ip: getClientIp(request) });
		return jsonResponse({ error: 'Too many requests, please try again later' }, 429);
	}

	// 可重用 token：更新后保持有效，直到下次轮换
	await env.DESC_DATA.put('resend_from', newFromEmail);

	auditLog('from_email_changed', { newFrom: newFromEmail, ip: getClientIp(request) });
	return jsonResponse({ success: true, message: 'Sender email updated' });
}

async function getStoredTokenHash(env: Env): Promise<string | null> {
	return await env.DESC_DATA.get('token_hash');
}

async function getTokenRotateDays(env: Env): Promise<number> {
	const cfg = await env.DESC_DATA.get('token_rotate_days');
	let days = 30;
	if (cfg) {
		const parsed = parseInt(cfg, 10);
		if (!Number.isNaN(parsed)) {
			days = parsed;
		}
	}
	return days < 30 ? 30 : days;
}

function isTokenStillActive(lastTime: string | null, rotateDays: number): boolean {
	if (!lastTime) {
		return false;
	}
	const lastDate = new Date(lastTime);
	const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
	return diffDays < rotateDays;
}

function isTokenChangeRateLimited(lastTime: string | null): boolean {
	if (!lastTime) {
		return false;
	}
	const lastDate = new Date(lastTime);
	if (Number.isNaN(lastDate.getTime())) {
		return false;
	}
	return Date.now() - lastDate.getTime() < TOKEN_CHANGE_RATE_LIMIT_MS;
}

function getClientIp(request: Request): string | null {
	const cfIp = request.headers.get('CF-Connecting-IP');
	if (cfIp) {
		return cfIp;
	}
	const xForwardedFor = request.headers.get('x-forwarded-for');
	if (xForwardedFor) {
		const first = xForwardedFor.split(',')[0].trim();
		if (first) {
			return first;
		}
	}
	return null;
}

async function isWriteRateLimited(request: Request, env: Env, route: string, token: string): Promise<boolean> {
	const rule = WRITE_RATE_LIMITS[route];
	if (!rule) {
		return false;
	}

	// 优先按客户端 IP 限流；IP 不可用（如本地开发）时退化为按 token 限流
	const clientIp = getClientIp(request);
	const clientKey = clientIp ? `ip:${clientIp}` : `token:${token}`;
	const key = `ratelimit:${route}:${clientKey}`;

	const now = Date.now();
	let count = 0;
	let windowStart = now;

	const raw = await env.DESC_DATA.get(key);
	if (raw) {
		try {
			const parsed = JSON.parse(raw) as { count?: number; start?: number };
			if (typeof parsed.count === 'number' && typeof parsed.start === 'number') {
				count = parsed.count;
				windowStart = parsed.start;
			}
		} catch {
			// 忽略损坏的记录，按新窗口处理
		}
	}

	if (now - windowStart >= rule.windowMs) {
		count = 0;
		windowStart = now;
	}

	if (count >= rule.max) {
		return true;
	}

	await env.DESC_DATA.put(key, JSON.stringify({ count: count + 1, start: windowStart }));
	return false;
}

// Upload handlers: expect JSON body { token, id, payload }
async function handleUpload(request: Request, env: Env, url: URL): Promise<Response> {
	const bodyResult = await parseJsonBody(request);
	if (!bodyResult.ok) {
		return bodyErrorResponse(bodyResult);
	}
	const body = bodyResult.body;

	const token = String(body.token ?? '');
	const kind = String(body.type ?? url.searchParams.get('type') ?? '').toLowerCase();
	const data = String(body.data ?? '');
	const payload = body.payload;

	if (!token || !kind || !data || payload === undefined) {
		return jsonResponse({ error: 'token, type, data and payload are required' }, 400);
	}

	if (!isValidKind(kind)) {
		return jsonResponse({ error: 'type must be one of item, buff or actor' }, 400);
	}

	if (!isValidDataId(data)) {
		return jsonResponse({ error: 'data must not exceed 200 bytes and must not contain control characters' }, 400);
	}

	const tokenHash = await getStoredTokenHash(env);
	if (!tokenHash) {
		return jsonResponse({ error: 'No valid token has been generated' }, 403);
	}
	if (!(await isTokenValid(token, tokenHash))) {
		auditLog('unauthorized_write', { route: ROUTE_UPLOAD_ID, reason: 'invalid_token', ip: getClientIp(request) });
		return jsonResponse({ error: 'Token verification failed' }, 403);
	}

	if (await isWriteRateLimited(request, env, ROUTE_UPLOAD_ID, token)) {
		auditLog('rate_limited', { route: ROUTE_UPLOAD_ID, ip: getClientIp(request) });
		return jsonResponse({ error: 'Too many requests, please try again later' }, 429);
	}

	let minified: string;
	try {
		minified = JSON.stringify(payload);
	} catch (e) {
		return jsonResponse({ error: 'payload must be a valid JSON-serializable object' }, 400);
	}

	// 限制 payload 大小（8MB），防止滥用并避免超出 KV 单值限制
	const payloadBytes = new TextEncoder().encode(minified).byteLength;
	if (payloadBytes > PAYLOAD_MAX_BYTES) {
		auditLog('upload_rejected', { kind, data, reason: 'payload_too_large', bytes: payloadBytes, ip: getClientIp(request) });
		return jsonResponse({ error: 'payload exceeds the 8MB size limit' }, 413);
	}

	const key = `data:${kind}:${data}`;
	await env.DESC_DATA.put(key, minified);

	auditLog('upload', { kind, data, bytes: payloadBytes, ip: getClientIp(request) });

	// 可重用 token：上传后保持有效，可继续使用
	return jsonResponse({ success: true, message: `${kind} ${data} saved` });
}

async function handleDownload(request: Request, env: Env, url: URL): Promise<Response> {
	const kind = String(url.searchParams.get('type') ?? '').toLowerCase();
	const data = String(url.searchParams.get('data') ?? '');

	if (!kind || !data) {
		return jsonResponse({ error: 'type and data query parameters are required' }, 400);
	}

	if (!isValidKind(kind)) {
		return jsonResponse({ error: 'type must be one of item, buff or actor' }, 400);
	}

	if (!isValidDataId(data)) {
		return jsonResponse({ error: 'data must not exceed 200 bytes and must not contain control characters' }, 400);
	}

	const key = `data:${kind}:${data}`;
	const stored = await env.DESC_DATA.get(key);
	if (!stored) {
		return jsonResponse({ error: `${kind} ${data} not found` }, 404);
	}

	return new Response(stored, {
		status: 200,
		headers: { 'Content-Type': 'application/json;charset=utf-8' },
	});
}

function isValidKind(kind: string): kind is 'item' | 'buff' | 'actor' {
	return kind === 'item' || kind === 'buff' || kind === 'actor';
}

type JsonBodyResult = { ok: true; body: any } | { ok: false; tooLarge: boolean };

// 解析 JSON 请求体，并显式限制请求体大小（返回区分“过大”与“无效”）
async function parseJsonBody(request: Request): Promise<JsonBodyResult> {
	const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
	try {
		const text = await request.text();
		const actualBytes = new TextEncoder().encode(text).byteLength;
		if (declaredLength > REQUEST_BODY_MAX_BYTES || actualBytes > REQUEST_BODY_MAX_BYTES) {
			return { ok: false, tooLarge: true };
		}
		return { ok: true, body: JSON.parse(text) };
	} catch {
		return { ok: false, tooLarge: false };
	}
}

// 仅当 bodyResult.ok 为 false 时调用（防御：ok 时也返回 400）
function bodyErrorResponse(result: JsonBodyResult): Response {
	if (result.ok) {
		return jsonResponse({ error: 'Invalid JSON request body' }, 400);
	}
	return result.tooLarge
		? jsonResponse({ error: 'Request body exceeds the size limit' }, 413)
		: jsonResponse({ error: 'Invalid JSON request body' }, 400);
}

function validateEmail(email: string): boolean {
	return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

// 恒定时间字符串比较：无论命中位置如何，都遍历完整长度，避免时序侧信道泄露
function constantTimeEqual(a: string, b: string): boolean {
	const aBytes = new TextEncoder().encode(a);
	const bBytes = new TextEncoder().encode(b);
	if (aBytes.length !== bBytes.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < aBytes.length; i++) {
		diff |= aBytes[i] ^ bBytes[i];
	}
	return diff === 0;
}

async function isTokenValid(token: string, tokenHash: string): Promise<boolean> {
	const computed = await sha256Hex(token);
	return constantTimeEqual(computed, tokenHash);
}

function generateSecureToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Array.from(bytes)
		.map((value) => value.toString(16).padStart(2, '0'))
		.join('');
}

function generateVerificationCode(): string {
	const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
	return String(value).padStart(6, '0');
}

function isAdminChangeCodeRateLimited(lastCodeTime: string | null): boolean {
	if (!lastCodeTime) {
		return false;
	}
	const lastDate = new Date(lastCodeTime);
	if (Number.isNaN(lastDate.getTime())) {
		return false;
	}
	return Date.now() - lastDate.getTime() < ADMIN_CHANGE_CODE_RATE_LIMIT_MS;
}

function isAdminChangeCodeValid(storedCode: string | null, storedTime: string | null, providedCode: string): boolean {
	if (!storedCode || !storedTime) {
		return false;
	}
	const time = new Date(storedTime);
	if (Number.isNaN(time.getTime())) {
		return false;
	}
	if (Date.now() - time.getTime() > ADMIN_CHANGE_CODE_TTL_MS) {
		return false;
	}
	return constantTimeEqual(storedCode, providedCode);
}

async function sha256Hex(value: string): Promise<string> {
	const data = new TextEncoder().encode(value);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hash))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

async function sendResetTokenEmail(adminEmail: string, token: string, resendApiKey: string, resendFrom: string): Promise<Response> {
	return fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${resendApiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: resendFrom,
			to: adminEmail,
			subject: '令牌更换哈希已生成',
			text: `您的令牌更换验证码为：${token}\n请妥善保存并在需要更换令牌时使用。`,
			html: `<p>您的令牌更换验证码为：<strong>${token}</strong></p><p>请妥善保存并在需要更换令牌时使用。</p>`,
		}),
	});
}

async function sendAdminChangeCodeEmail(adminEmail: string, code: string, resendApiKey: string, resendFrom: string): Promise<Response> {
	return fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${resendApiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: resendFrom,
			to: adminEmail,
			subject: '管理员邮箱变更验证码',
			text: `您的管理员邮箱变更验证码为：${code}\n验证码 10 分钟内有效，请勿泄露给他人。`,
			html: `<p>您的管理员邮箱变更验证码为：<strong>${code}</strong></p><p>验证码 10 分钟内有效，请勿泄露给他人。</p>`,
		}),
	});
}

async function safeReadResponseBody(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return 'Unable to read response body';
	}
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json;charset=utf-8' },
	});
}

async function getCorsOrigin(env: Env): Promise<string> {
	// 可通过 KV 键 cors_origin 配置允许的来源，默认 *
	return (await env.DESC_DATA.get('cors_origin')) ?? '*';
}

function corsHeaders(origin: string): Record<string, string> {
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		'Access-Control-Max-Age': '86400',
	};
}

// 审计日志：输出结构化 JSON，可在 Cloudflare Workers Logs / wrangler tail 中追溯写操作
function auditLog(event: string, details: Record<string, unknown> = {}): void {
	console.log(JSON.stringify({ audit: true, t: new Date().toISOString(), event, ...details }));
}

function isValidDataId(data: string): boolean {
	// 限制长度，确保 KV 键总长远低于 512 字节上限
	if (new TextEncoder().encode(data).byteLength > DATA_MAX_BYTES) {
		return false;
	}
	// 禁止控制字符，避免异常键
	return !/[\u0000-\u001F\u007F]/.test(data);
}

// 预定处理程序：通过 cron 触发器每天运行，在满足时间间隔时轮换令牌
async function handleScheduled(env: Env): Promise<void> {
	const cfg = await env.DESC_DATA.get('token_rotate_days');
	let days = 30;
	if (cfg) {
		const parsed = parseInt(cfg, 10);
		if (!Number.isNaN(parsed)) {
			days = parsed;
		}
	}
	if (days < 30) {
		days = 30;
	}

	const last = await env.DESC_DATA.get('token_replace_time');
	const now = new Date();
	let shouldRotate = false;
	if (!last) {
		shouldRotate = true;
	} else {
		const lastDate = new Date(last);
		const diffDays = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
		if (diffDays >= days) {
			shouldRotate = true;
		}
	}

	if (!shouldRotate) {
		return;
	}

	const adminEmail = await env.DESC_DATA.get('admin_email');
	const resendApiKey = await env.DESC_DATA.get('resend_api_key');
	const resendFrom = await env.DESC_DATA.get('resend_from');
	if (!adminEmail || !resendApiKey || !resendFrom) {
		return;
	}

	const token = generateSecureToken();
	const tokenHash = await sha256Hex(token);
	const tokenReplaceTime = new Date().toISOString();

	await Promise.all([
		env.DESC_DATA.put('token_hash', tokenHash),
		env.DESC_DATA.put('token_replace_time', tokenReplaceTime),
	]);

	// fire-and-forget email; don't block on response
	try {
		await sendResetTokenEmail(adminEmail, token, resendApiKey, resendFrom);
	} catch (e) {
		// ignore send errors in scheduled run
	}

	auditLog('token_rotated_auto', {});
}
