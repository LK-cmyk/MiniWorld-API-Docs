import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loguru import logger

from common.merge import merge_lua_files
from common.config import MULTIPLE_30_DIR, MERGED_30_FILE, ORDER_30

FOLDER_PATH = str(MULTIPLE_30_DIR)
OUTPUT_FILE = str(MERGED_30_FILE)
ORDER_DEFINITION: list[str] = [  # 自定义顺序定义
    "MNGlobalFunc",  # 全局函数
    "MNEnumLib",  # 枚举库
    "MNData",  # 数据
    "MNTable",  # 表格
    "MNArray",  # 数组
    "MNComponent",  # 组件
    "MNEvent",  # 事件
    "MNTimer",  # 计时器
    "MNMod",  # 模组
    "MNWorldContainer",  # 世界容器
    "MNWorld",  # 世界
    "MNMap",  # 地图
    "MNBlock",  # 方块
    "MNGameObject",  # 游戏对象
    "MNActor",  # 角色
    "MNPlayer",  # 玩家
    "MNMonster",  # 怪物
    "MNArea",  # 区域
    "MNBuff",  # Buff
    "MNItem",  # 物品
    "MNBackpack",  # 背包
    "MNChat",  # 聊天
    "MNCustomUI",  # 自定义UI
    "MNGraphics",  # 图形
    "MNTimeline",  # 剧情动画
]


def main():
    """主函数"""
    if not MULTIPLE_30_DIR.exists():
        logger.error(f"文件夹 '{FOLDER_PATH}' 不存在")
        return
    merge_lua_files(FOLDER_PATH, OUTPUT_FILE, ORDER_DEFINITION)


if __name__ == "__main__":
    main()
