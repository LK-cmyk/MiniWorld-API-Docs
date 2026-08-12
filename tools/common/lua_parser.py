"""从 Lua 声明文件 (.d.lua) 中提取代码元素（函数名、枚举类与字段）"""

import os
import re
from typing import Optional

FUNCTION_RE: re.Pattern[str] = re.compile(r"^function\s+([A-Za-z_][\w\.:]*)")
CLASS_RE: str = r"--- @class"
FIELD_RE: str = r"--- @field"


def get_function_names(path: str) -> set[str]:
    """从本地 Lua 声明文件中提取函数名

    支持 `function Module.func` 和 `function Module:method` 两种格式，
    对于方法调用 (`:`)，只提取方法名部分

    Args:
        path: 本地文件路径
    Returns:
        函数名集合
    """
    out_funcs: set[str] = set()
    with open(path, "r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line.startswith("function "):
                continue
            match = FUNCTION_RE.match(line)
            if not match:
                continue
            function_name: str = match.group(1)
            if ":" in function_name:
                _, function_name = function_name.split(":", 1)
            out_funcs.add(function_name)
    return out_funcs


def get_enum_definitions(path: str) -> dict[str, list[str]]:
    """分析本地 Lua 声明文件，提取枚举类名和字段名

    解析 `--- @class ClassName` 和 `--- @field fieldName` 注释。

    Args:
        path: 文件路径

    Returns:
        {类名: [字段名列表]}
    """
    out_dict: dict[str, list[str]] = {}
    class_name: Optional[str] = None
    with open(path, "r", encoding="utf-8") as file:
        for line in file:
            if re.match(CLASS_RE, line):
                match: Optional[re.Match[str]] = re.search(r"--- @class (\w+)", line)
                if match:
                    current_class_name: str = match.group(1)
                    class_name = current_class_name
                    out_dict[current_class_name] = []
            elif re.match(FIELD_RE, line):
                match = re.search(r"--- @field (\w+)", line)
                if match and class_name and class_name in out_dict:
                    field_name: str = match.group(1)
                    out_dict[class_name].append(field_name)
    return out_dict
