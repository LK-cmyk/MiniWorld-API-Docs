"""处理 LuaLS 注释中的 @annotation 标记"""

import re

ANNOTATION_TAG_RE: re.Pattern[str] = re.compile(r"^([ \t]*---[ \t]*)@\w+\b[ \t]*", re.MULTILINE)
REMOVE_AT_SIGN_RE: re.Pattern[str] = re.compile(r"^[ \t]*---.*$", re.MULTILINE)
EMPTY_COMMENT_LINE_RE: re.Pattern[str] = re.compile(r"^[ \t]*---[ \t]*\r?\n", re.MULTILINE)


def strip_annotations(content: str) -> str:
    """剔除 LuaLS 注释中的 @tag，并移除所有 @ 符号，清理空注释行

    Args:
        content: 原始文件内容

    Returns:
        处理后的文件内容
    """
    # 仅剔除 @tag 本身 (如 @return → 空, 保留 table)
    content = ANNOTATION_TAG_RE.sub(r"\1", content)
    # 移除 "---" 行中残留的 @ 符号 (描述文字前的 @ 标记)
    content = REMOVE_AT_SIGN_RE.sub(lambda m: m.group(0).replace("@", ""), content)
    # 移除无内容的注释行
    content = EMPTY_COMMENT_LINE_RE.sub("", content)
    # 处理文件末尾可能残留的无内容注释行 (无换行符的情况)
    content = re.sub(r"^[ \t]*---[ \t]*$", "", content, flags=re.MULTILINE)
    return content
