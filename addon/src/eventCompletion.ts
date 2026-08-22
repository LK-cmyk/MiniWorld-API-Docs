import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { COMPLETION_MODE_SETTING, getCompletionMode, type CompletionMode } from './completionMode';

/** 事件定义文件 */
const EVENT_DEFINITIONS_FILE_20 = path.join('addon', 'types', '2.0', 'MNEvent.d.json');
const EVENT_DEFINITIONS_FILE_30 = path.join('addon', 'types', '3.0', 'MNEvent.d.json');

/** 3.0 模式支持的事件枚举类 */
const EVENT_CLASSES_30 = ['TriggerEvent', 'ObjectEvent'] as const;
type EventClass30 = typeof EVENT_CLASSES_30[number];

export type EventDefinition = {
    desc?: string;
    event_info?: Record<string, string>;
};

let eventDefinitionsReady = false;
let eventDefinitions: Map<string, EventDefinition> = new Map();
let cachedCompletionItems: vscode.CompletionItem[] | null = null;
let cachedClassCompletionItems: Map<EventClass30, vscode.CompletionItem[]> = new Map();
let currentMode: CompletionMode = '2.0';
let loadSeq = 0;

function getEventDefinitionsFile(context: vscode.ExtensionContext, mode: '2.0' | '3.0'): string {
    const rel = mode === '3.0' ? EVENT_DEFINITIONS_FILE_30 : EVENT_DEFINITIONS_FILE_20;
    return context.asAbsolutePath(rel);
}

/** 获取（必要时构建）2.0 模式的补全缓存 */
function getCachedCompletionItems(): vscode.CompletionItem[] {
    if (!cachedCompletionItems) {
        cachedCompletionItems = buildEventCompletionItems(eventDefinitions);
    }
    return cachedCompletionItems;
}

/** 获取（必要时构建）3.0 模式指定事件类的补全缓存 */
function getCachedClassCompletionItems(className: EventClass30): vscode.CompletionItem[] {
    let items = cachedClassCompletionItems.get(className);
    if (!items) {
        items = buildClassCompletionItems(eventDefinitions, className);
        cachedClassCompletionItems.set(className, items);
    }
    return items;
}

export async function parseEventDefinitions(filePath: string): Promise<Map<string, EventDefinition>> {
    try {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, EventDefinition>;

        return new Map(Object.entries(parsed).sort(([left], [right]) => left.localeCompare(right)));
    } catch (error) {
        console.warn(`读取事件补全文件失败: ${filePath}`, error);
        return new Map();
    }
}

/** 构建事件的 Markdown 文档（描述 + 参数表） */
function buildEventDocumentation(definition: EventDefinition): vscode.MarkdownString {
    const infoLines = definition.event_info
        ? Object.entries(definition.event_info).map(([key, value]) => `- ${key}: ${value}`)
        : [];

    const documentation = [
        definition.desc ? `**${definition.desc}**` : '',
        infoLines.length > 0 ? `参数:\n${infoLines.join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    return new vscode.MarkdownString(documentation);
}

/** 构建 2.0 模式的补全项（键为完整事件名，补全后自动包裹长括号） */
export function buildEventCompletionItems(definitions: Map<string, EventDefinition>): vscode.CompletionItem[] {
    return Array.from(definitions.entries()).map(([eventName, definition]) => {
        const item = new vscode.CompletionItem(eventName, vscode.CompletionItemKind.Event);
        item.detail = definition.desc ?? 'MiniWorld 事件';
        item.filterText = eventName;
        item.insertText = eventName;
        item.command = {
            command: 'complete.wrapEventBrackets',
            title: '补全事件长括号',
            arguments: [eventName]
        };
        item.documentation = buildEventDocumentation(definition);

        return item;
    });
}

/** 构建 3.0 模式指定事件类的补全项（按类名前缀筛选，直接插入字段名） */
export function buildClassCompletionItems(
    definitions: Map<string, EventDefinition>,
    className: EventClass30,
): vscode.CompletionItem[] {
    const prefix = `${className}.`;
    return Array.from(definitions.entries())
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, definition]) => {
            const fieldName = key.substring(prefix.length);
            const item = new vscode.CompletionItem(fieldName, vscode.CompletionItemKind.Event);
            item.detail = definition.desc ?? `MiniWorld ${className} 事件`;
            item.filterText = fieldName;
            item.insertText = fieldName;
            item.documentation = buildEventDocumentation(definition);

            return item;
        });
}

/**
 * 判断光标前的补全上下文。
 * - 2.0：`[=[` 长括号字符串内
 * - 3.0：`TriggerEvent.` / `ObjectEvent.` 之后
 */
function getCompletionContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    mode: '2.0' | '3.0',
): { kind: '2.0' | '3.0'; className?: EventClass30; prefix: string } | null {
    const textBeforeCursor = document.lineAt(position.line).text.substring(0, position.character);

    if (mode === '3.0') {
        // 前面须为非标识符或行首，避免误匹配 AddTriggerEvent
        const match = /(?:^|[^\w])(TriggerEvent|ObjectEvent)\.([\w.]*)$/.exec(textBeforeCursor);
        if (match) {
            return { kind: '3.0', className: match[1] as EventClass30, prefix: match[2] };
        }
        return null;
    }

    const lastLongBracket = textBeforeCursor.lastIndexOf('[=[');
    if (lastLongBracket !== -1) {
        return { kind: '2.0', prefix: textBeforeCursor.substring(lastLongBracket + 3) };
    }

    return null;
}

/**
 * 注册事件补全提供者和括号包裹命令。
 * 补全模式由设置项 `miniworld.completion` 控制，设置变化时自动重载对应版本定义。
 */
export function registerEventCompletion(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    /** 按当前设置异步加载对应版本的事件定义 */
    function loadEventDefinitions(): void {
        const targetMode = getCompletionMode();
        const seq = ++loadSeq;
        currentMode = targetMode;
        eventDefinitionsReady = false;
        cachedCompletionItems = null;
        cachedClassCompletionItems.clear();

        if (targetMode === 'off') {
            return;
        }

        const filePath = getEventDefinitionsFile(context, targetMode);
        parseEventDefinitions(filePath).then(defs => {
            if (seq !== loadSeq) { return; }
            eventDefinitions = defs;
            if (targetMode === '3.0') {
                cachedClassCompletionItems.clear();
            } else {
                cachedCompletionItems = buildEventCompletionItems(defs);
            }
            eventDefinitionsReady = true;
        });
    }

    loadEventDefinitions();

    // 设置变化时重载事件定义
    disposables.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(COMPLETION_MODE_SETTING)) {
                loadEventDefinitions();
            }
        })
    );

    // 注册补全提供者（触发字符 '.'）
    disposables.push(
        vscode.languages.registerCompletionItemProvider(
            { language: 'lua' },
            {
                provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                    if (currentMode === 'off' || !eventDefinitionsReady) {
                        return [];
                    }
                    const context = getCompletionContext(document, position, currentMode);
                    if (context === null) {
                        return [];
                    }
                    // 返回缓存项，由 VS Code 基于 filterText 原生过滤；
                    // CompletionList(isIncomplete:false) 让结果被缓存，避免重复触发。
                    if (context.kind === '2.0') {
                        return new vscode.CompletionList(getCachedCompletionItems(), false);
                    }
                    return new vscode.CompletionList(getCachedClassCompletionItems(context.className!), false);
                },
            },
            '.'
        )
    );

    // 注册长括号包裹命令
    disposables.push(
        vscode.commands.registerCommand('complete.wrapEventBrackets', (eventName: string) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !eventName) { return; }

            const document = editor.document;
            const cursorPos = editor.selection.active;
            const eventStartPos = new vscode.Position(cursorPos.line, cursorPos.character - eventName.length);

            if (eventStartPos.character < 0) { return; }

            const lineText = document.lineAt(cursorPos.line).text;
            const textBeforeEvent = lineText.substring(0, eventStartPos.character);
            const textAfterEvent = lineText.substring(cursorPos.character);

            const hasLeftBracket = textBeforeEvent.endsWith('[=[');
            const hasRightBracket = textAfterEvent.startsWith(']=]');

            const edits: vscode.WorkspaceEdit = new vscode.WorkspaceEdit();

            if (!hasLeftBracket) {
                edits.insert(document.uri, eventStartPos, '[=[');
            }
            if (!hasRightBracket) {
                edits.insert(document.uri, cursorPos, ']=]');
            }

            if (edits.size > 0) {
                vscode.workspace.applyEdit(edits);
            }
        })
    );

    return disposables;
}
