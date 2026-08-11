import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
// 让 cloudflare:test 的 `env` 包含项目 KV 绑定类型
// 注：不能直接 extends 全局 Env（worker-configuration.d.ts 的全局声明在测试项目里不可见），故显式声明
import worker from "../src/index";

declare module "cloudflare:test" {
	interface ProvidedEnv {
		DESC_DATA: KVNamespace;
	}
}

const IncomingRequest = Request as any;

class FakeKV {
	private store = new Map<string, string>();

	async get(key: string): Promise<string | null> {
		return this.store.has(key) ? this.store.get(key)! : null;
	}

	async put(key: string, value: string): Promise<void> {
		this.store.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.store.delete(key);
	}
}

async function sha256Hex(value: string): Promise<string> {
	const data = new TextEncoder().encode(value);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

describe("worker routing", () => {
	it("returns 404 for unknown routes (unit style)", async () => {
		const request = new IncomingRequest("http://example.com/unknown");
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
		expect(await response.text()).toBe("Not Found");
	});

	it("returns 404 for unknown routes (integration style)", async () => {
		const response = await SELF.fetch("https://example.com/unknown");
		expect(response.status).toBe(404);
		expect(await response.text()).toBe("Not Found");
	});
});

describe("reusable token", () => {
	it("keeps the token valid after a successful use so it can be reused", async () => {
		const kv = new FakeKV();
		const token = "reusable-token";
		const tokenHash = await sha256Hex(token);
		await kv.put("token_hash", tokenHash);
		await kv.put("token_replace_time", "2026-01-01T00:00:00.000Z");

		const envStub = { DESC_DATA: kv } as any;

		// change-admin-email now requires a verification code sent to the old email
		const missingCodeRequest = new Request("http://example.com/api/change-admin-email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, new_admin_email: "new-admin@example.com" }),
		});
		const missingCodeResponse = await worker.fetch(missingCodeRequest, envStub, createExecutionContext());
		expect(missingCodeResponse.status).toBe(400);

		const firstRequest = new Request("http://example.com/api/change-from-email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, new_from_email: "from@example.com" }),
		});
		const firstResponse = await worker.fetch(firstRequest, envStub, createExecutionContext());

		expect(firstResponse.status).toBe(200);
		expect(await kv.get("token_hash")).toBe(tokenHash);
		expect(await kv.get("token_replace_time")).toBe("2026-01-01T00:00:00.000Z");

		const secondRequest = new Request("http://example.com/api/change-from-email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, new_from_email: "from2@example.com" }),
		});
		const secondResponse = await worker.fetch(secondRequest, envStub, createExecutionContext());
		expect(secondResponse.status).toBe(200);
	});

	it("rate limits reset hash generation for 10 minutes after a recent change", async () => {
		const kv = new FakeKV();
		const token = "cooldown-token";
		const tokenHash = await sha256Hex(token);
		await kv.put("token_hash", tokenHash);
		await kv.put("token_replace_time", new Date(Date.now() - 5 * 60 * 1000).toISOString());
		await kv.put("admin_email", "admin@example.com");
		await kv.put("resend_api_key", "fake-key");
		await kv.put("resend_from", "from@example.com");

		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;

		try {
			const request = new Request("http://example.com/api/generate-reset-hash", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token }),
			});
			const response = await worker.fetch(request, { DESC_DATA: kv } as any, createExecutionContext());

			expect(response.status).toBe(429);
			const body = (await response.json()) as { error: string };
			expect(body.error).toContain("rate limited");
			expect(await kv.get("token_hash")).toBe(tokenHash);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

describe("admin email change verification code", () => {
	it("requires a code sent to the old email before changing the admin email", async () => {
		const kv = new FakeKV();
		const token = "code-token";
		const tokenHash = await sha256Hex(token);
		await kv.put("token_hash", tokenHash);
		await kv.put("token_replace_time", "2026-01-01T00:00:00.000Z");
		await kv.put("admin_email", "old-admin@example.com");
		await kv.put("resend_api_key", "fake-key");
		await kv.put("resend_from", "from@example.com");

		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;

		try {
			const envStub = { DESC_DATA: kv } as any;

			// send code to the old admin email
			const sendRequest = new Request("http://example.com/api/send-admin-email-change-code", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token }),
			});
			const sendResponse = await worker.fetch(sendRequest, envStub, createExecutionContext());
			expect(sendResponse.status).toBe(200);

			const code = await kv.get("admin_email_change_code");
			expect(code).toBeTruthy();
			expect(/^\d{6}$/.test(code!)).toBe(true);

			// wrong code is rejected
			const wrongRequest = new Request("http://example.com/api/change-admin-email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, new_admin_email: "new-admin@example.com", code: "000000" }),
			});
			const wrongResponse = await worker.fetch(wrongRequest, envStub, createExecutionContext());
			expect(wrongResponse.status).toBe(403);
			expect(await kv.get("admin_email")).toBe("old-admin@example.com");

			// correct code changes the email and clears the code
			const changeRequest = new Request("http://example.com/api/change-admin-email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, new_admin_email: "new-admin@example.com", code }),
			});
			const changeResponse = await worker.fetch(changeRequest, envStub, createExecutionContext());
			expect(changeResponse.status).toBe(200);
			expect(await kv.get("admin_email")).toBe("new-admin@example.com");
			expect(await kv.get("admin_email_change_code")).toBeNull();
			expect(await kv.get("admin_email_change_code_time")).toBeNull();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("rate limits sending the admin email change code", async () => {
		const kv = new FakeKV();
		const token = "code-rate-limit-token";
		const tokenHash = await sha256Hex(token);
		await kv.put("token_hash", tokenHash);
		await kv.put("token_replace_time", "2026-01-01T00:00:00.000Z");
		await kv.put("admin_email", "old-admin@example.com");
		await kv.put("resend_api_key", "fake-key");
		await kv.put("resend_from", "from@example.com");
		await kv.put("admin_email_change_code_time", new Date(Date.now() - 5 * 1000).toISOString());

		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;

		try {
			const request = new Request("http://example.com/api/send-admin-email-change-code", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token }),
			});
			const response = await worker.fetch(request, { DESC_DATA: kv } as any, createExecutionContext());
			expect(response.status).toBe(429);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

describe("write endpoint rate limiting", () => {
	it("limits repeated writes from the same client (token fallback when no IP)", async () => {
		const kv = new FakeKV();
		const token = "rl-token";
		await kv.put("token_hash", await sha256Hex(token));
		await kv.put("token_replace_time", "2026-01-01T00:00:00.000Z");

		const envStub = { DESC_DATA: kv } as any;
		let lastStatus = 0;
		for (let i = 0; i < 6; i++) {
			const req = new Request("http://example.com/api/change-from-email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, new_from_email: `from${i}@example.com` }),
			});
			lastStatus = (await worker.fetch(req, envStub, createExecutionContext())).status;
		}
		expect(lastStatus).toBe(429);
	});

	it("limits bulk uploads from the same client", async () => {
		const kv = new FakeKV();
		const token = "rl-upload-token";
		await kv.put("token_hash", await sha256Hex(token));
		await kv.put("token_replace_time", "2026-01-01T00:00:00.000Z");

		const envStub = { DESC_DATA: kv } as any;
		let lastStatus = 0;
		for (let i = 0; i < 61; i++) {
			const req = new Request("http://example.com/api/upload-id", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, type: "item", data: `bulk-${i}`, payload: { i } }),
			});
			lastStatus = (await worker.fetch(req, envStub, createExecutionContext())).status;
		}
		expect(lastStatus).toBe(429);
	});
});

describe("security hardening", () => {
	it("answers CORS preflight and includes CORS headers on responses", async () => {
		const kv = new FakeKV();
		const envStub = { DESC_DATA: kv } as any;

		const options = new Request("http://example.com/api/upload-id", { method: "OPTIONS" });
		const optionsResponse = await worker.fetch(options, envStub, createExecutionContext());
		expect(optionsResponse.status).toBe(204);
		expect(optionsResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(optionsResponse.headers.get("Access-Control-Allow-Methods")).toContain("POST");

		const download = new Request("http://example.com/api/download?type=item&data=123");
		const downloadResponse = await worker.fetch(download, envStub, createExecutionContext());
		expect(downloadResponse.status).toBe(404);
		expect(downloadResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});

	it("honors a custom cors_origin from KV", async () => {
		const kv = new FakeKV();
		await kv.put("cors_origin", "https://panel.example.com");
		const envStub = { DESC_DATA: kv } as any;

		const options = new Request("http://example.com/api/upload-id", { method: "OPTIONS" });
		const response = await worker.fetch(options, envStub, createExecutionContext());
		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://panel.example.com");
	});

	it("rejects uploads whose data id is too long", async () => {
		const kv = new FakeKV();
		const token = "data-len-token";
		await kv.put("token_hash", await sha256Hex(token));
		await kv.put("token_replace_time", "2026-01-01T00:00:00.000Z");

		const envStub = { DESC_DATA: kv } as any;
		const longData = "x".repeat(201);
		const request = new Request("http://example.com/api/upload-id", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, type: "item", data: longData, payload: { a: 1 } }),
		});
		const response = await worker.fetch(request, envStub, createExecutionContext());
		expect(response.status).toBe(400);
		expect(await kv.get(`data:item:${longData}`)).toBeNull();
	});

	it("rejects uploads whose data id contains control characters", async () => {
		const kv = new FakeKV();
		const token = "data-ctrl-token";
		await kv.put("token_hash", await sha256Hex(token));
		await kv.put("token_replace_time", "2026-01-01T00:00:00.000Z");

		const envStub = { DESC_DATA: kv } as any;
		const request = new Request("http://example.com/api/upload-id", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, type: "item", data: "bad\nkey", payload: { a: 1 } }),
		});
		const response = await worker.fetch(request, envStub, createExecutionContext());
		expect(response.status).toBe(400);
	});

	it("rejects requests whose body exceeds the 16MB limit", async () => {
		const kv = new FakeKV();
		const token = "body-limit-token";
		await kv.put("token_hash", await sha256Hex(token));
		await kv.put("token_replace_time", "2026-01-01T00:00:00.000Z");

		const envStub = { DESC_DATA: kv } as any;
		const request = new Request("http://example.com/api/upload-id", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, type: "item", data: "huge", payload: { data: "x".repeat(17 * 1024 * 1024) } }),
		});
		const response = await worker.fetch(request, envStub, createExecutionContext());
		expect(response.status).toBe(413);
		const json = (await response.json()) as { error: string };
		expect(json.error).toContain("size limit");
	});
});

describe("upload/download data key", () => {
	it("stores data under data:{type}:{data} key and downloads it back", async () => {
		const kv = new FakeKV();
		const token = "key-test-token";
		const tokenHash = await sha256Hex(token);
		await kv.put("token_hash", tokenHash);
		await kv.put("token_replace_time", "2026-01-01T00:00:00.000Z");

		const envStub = { DESC_DATA: kv } as any;
		const upload = new Request("http://example.com/api/upload-id", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				token,
				type: "item",
				data: "123",
				payload: { name: "demo", version: 1 },
			}),
		});
		const uploadResponse = await worker.fetch(upload, envStub, createExecutionContext());
		expect(uploadResponse.status).toBe(200);

		expect(await kv.get("data:item:123")).toBe('{"name":"demo","version":1}');
		expect(await kv.get("data:item:123.json")).toBeNull();

		const download = new Request("http://example.com/api/download?type=item&data=123");
		const downloadResponse = await worker.fetch(download, envStub, createExecutionContext());
		expect(downloadResponse.status).toBe(200);
		expect(await downloadResponse.text()).toBe('{"name":"demo","version":1}');
	});

	it("rejects uploads whose payload exceeds the 8MB limit", async () => {
		const kv = new FakeKV();
		const token = "size-limit-token";
		await kv.put("token_hash", await sha256Hex(token));
		await kv.put("token_replace_time", "2026-01-01T00:00:00.000Z");

		const envStub = { DESC_DATA: kv } as any;
		const request = new Request("http://example.com/api/upload-id", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				token,
				type: "item",
				data: "too-big",
				payload: { data: "x".repeat(8 * 1024 * 1024 + 1) },
			}),
		});
		const response = await worker.fetch(request, envStub, createExecutionContext());
		expect(response.status).toBe(413);
		expect(await kv.get("data:item:too-big")).toBeNull();
	});

	it("allows a payload just under the 8MB limit", async () => {
		const kv = new FakeKV();
		const token = "size-ok-token";
		await kv.put("token_hash", await sha256Hex(token));
		await kv.put("token_replace_time", "2026-01-01T00:00:00.000Z");

		const envStub = { DESC_DATA: kv } as any;
		const request = new Request("http://example.com/api/upload-id", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				token,
				type: "actor",
				data: "ok-size",
				payload: { data: "x".repeat(8 * 1024 * 1024 - 100) },
			}),
		});
		const response = await worker.fetch(request, envStub, createExecutionContext());
		expect(response.status).toBe(200);
		expect(await kv.get("data:actor:ok-size")).not.toBeNull();
	});
});
