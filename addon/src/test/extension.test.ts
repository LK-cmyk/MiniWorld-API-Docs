import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import { buildClassCompletionItems, buildEventCompletionItems, parseEventDefinitions } from '../eventCompletion';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('parses event definitions from json', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miniworld-event-'));
		const filePath = path.join(tempDir, 'MNEvent.d.json');
		fs.writeFileSync(filePath, JSON.stringify({
			'Game.Hour': {
				desc: '世界小时时间变化',
			},
		}, null, 2));

		const definitions = await parseEventDefinitions(filePath);

		assert.strictEqual(definitions.size, 1);
		assert.strictEqual(definitions.get('Game.Hour')?.desc, '世界小时时间变化');
	});

	test('builds 2.0 completion items with bracket-wrap command', () => {
		const definitions = new Map<string, { desc?: string }>([['Player.Die', { desc: '玩家死亡' }]]);
		const items = buildEventCompletionItems(definitions as Map<string, { desc?: string; event_info?: Record<string, string> }>);

		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].label, 'Player.Die');
		assert.strictEqual(items[0].detail, '玩家死亡');
		assert.strictEqual(items[0].insertText, 'Player.Die');
		// 2.0 补全项挂长括号包裹命令
		assert.strictEqual(items[0].command?.command, 'complete.wrapEventBrackets');
		assert.strictEqual(items[0].command?.arguments?.[0], 'Player.Die');
	});

	test('builds 3.0 completion items filtered by event class', () => {
		const definitions = new Map<string, { desc?: string; event_info?: Record<string, string> }>([
			['TriggerEvent.PlayerClickBlock', { desc: '当任意玩家点击方块', event_info: { blockid: '方块类型' } }],
			['TriggerEvent.GameStart', { desc: '游戏创建' }],
			['ObjectEvent.PlayerClickBlock', { desc: '当此玩家点击方块' }],
		]);

		const triggerItems = buildClassCompletionItems(definitions, 'TriggerEvent');
		const objectItems = buildClassCompletionItems(definitions, 'ObjectEvent');

		// 只包含 TriggerEvent 前缀的键，去掉类名前缀作为补全名
		assert.strictEqual(triggerItems.length, 2);
		assert.strictEqual(triggerItems[0].label, 'PlayerClickBlock');
		assert.strictEqual(triggerItems[0].detail, '当任意玩家点击方块');
		assert.strictEqual(triggerItems[0].insertText, 'PlayerClickBlock');
		assert.strictEqual(triggerItems[1].label, 'GameStart');
		// 3.0 使用枚举引用，不挂长括号包裹命令
		assert.strictEqual(triggerItems[0].command, undefined);

		assert.strictEqual(objectItems.length, 1);
		assert.strictEqual(objectItems[0].label, 'PlayerClickBlock');
		assert.strictEqual(objectItems[0].detail, '当此玩家点击方块');
	});
});
