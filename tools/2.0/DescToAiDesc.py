"""将 multiple/2.0 合并后的声明文件转换为 AI 描述文件（去除 @annotation 标记）"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loguru import logger

from common.annotation import strip_annotations
from common.config import MERGED_20_FILE, API_20_FILE

INPUT_FILE = str(MERGED_20_FILE)
OUTPUT_DIR = str(API_20_FILE.parent)
OUTPUT_FILE = str(API_20_FILE)


def main() -> None:
    """主函数"""
    if not MERGED_20_FILE.exists():
        logger.error(f"输入文件不存在: {INPUT_FILE}")
        logger.error("请先运行 Merge.py 生成 merged.2.0.lua 文件")
        return

    content = MERGED_20_FILE.read_text(encoding="utf-8")
    result = strip_annotations(content)

    API_20_FILE.parent.mkdir(parents=True, exist_ok=True)
    API_20_FILE.write_text(result, encoding="utf-8")

    logger.info(f"处理完成！")
    logger.info(f"输入: {INPUT_FILE}")
    logger.info(f"输出: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
