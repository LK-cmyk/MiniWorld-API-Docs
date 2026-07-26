"""合并 multiple/2.0 目录下的所有 .d.lua 文件为一个整体声明文件"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loguru import logger

from common.merge import merge_lua_files
from common.config import MULTIPLE_20_DIR, MERGED_20_FILE, ORDER_20

INPUT_DIR = str(MULTIPLE_20_DIR)
OUTPUT_FILE = str(MERGED_20_FILE)


def main() -> None:
    """主函数"""
    if not MULTIPLE_20_DIR.exists():
        logger.error(f"文件夹 '{INPUT_DIR}' 不存在")
        return

    merge_lua_files(INPUT_DIR, OUTPUT_FILE, ORDER_20)


if __name__ == "__main__":
    main()
