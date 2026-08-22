import * as vscode from 'vscode';

import { ApiSearchProvider } from './apiSearch';
import { registerDeclarationCommands } from './declarationManager';
import { registerEventCompletion } from './eventCompletion';

export function activate(context: vscode.ExtensionContext) {
    console.log('MiniWorld API Desc 完成插件已激活');
    context.subscriptions.push(...registerDeclarationCommands(context)); // 声明管理
    context.subscriptions.push(...registerEventCompletion(context)); // 事件补全

    // API 搜索
    const apiSearchProvider = new ApiSearchProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ApiSearchProvider.viewType,
            apiSearchProvider,
        ),
        vscode.commands.registerCommand('miniworld.apiSearch.focus', () => {
            vscode.commands.executeCommand('workbench.view.extension.miniworld-api-search');
        }),
        vscode.commands.registerCommand('miniworld.apiSearch.refresh', async () => {
            await apiSearchProvider.refresh();
        }),
        vscode.commands.registerCommand('miniworld.apiSearch.clearCache', async () => {
            const ok = await apiSearchProvider.clearIdCache();
            if (ok) {
                vscode.window.showInformationMessage('MiniWorld API：ID 数据缓存已清空并重新下载');
            } else {
                vscode.window.showWarningMessage('MiniWorld API：缓存已清空，但重新下载失败（请检查服务器地址设置）');
            }
        }),
    );
}

export function deactivate() { }