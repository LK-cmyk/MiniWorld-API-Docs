import * as vscode from 'vscode';

/**
 * 补全模式设置项 key，控制声明补全 + 事件补全：
 * - '2.0'：UGC 2.0（默认）
 * - '3.0'：UGC 3.0
 * - 'off'：关闭补全
 */
export const COMPLETION_MODE_SETTING = 'miniworld.completion';

/** 补全模式：2.0 / 3.0 / 关闭 */
export type CompletionMode = '2.0' | '3.0' | 'off';

/** 读取补全模式设置；非法值回退到 '2.0' */
export function getCompletionMode(): CompletionMode {
    const value = vscode.workspace.getConfiguration().get<string>(COMPLETION_MODE_SETTING, '2.0');
    if (value === '3.0' || value === 'off') {
        return value;
    }
    return '2.0';
}
