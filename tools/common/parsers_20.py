"""2.0 版本专用解析函数：从网页提取函数/枚举/事件数据

本模块仅提供纯数据采集函数，不包含任何编排或输出逻辑。
"""

from __future__ import annotations

import json
import os
import re

import requests
from bs4 import BeautifulSoup, Tag

from common.config import (
    ENUM_URL_20,
    EVENT_URL_20,
    FUNC_URLS_20,
    IGNORE_EVENT_PARAMS,
    MULTIPLE_20_DIR,
    SKIP_ENUM_CLASSES_20,
    WEB_FILTER_BLACKLIST_20,
)

# ── FuncCompare ──────────────────────────────────

FUNC_URLS: dict[str, str] = FUNC_URLS_20
FUNC_FILES_PATH: str = str(MULTIPLE_20_DIR)
WEB_FILTER_BLACKLIST: set[str] = WEB_FILTER_BLACKLIST_20


def func_analyze_web(url: str) -> set[str]:
    """从 2.0 网页 API 文档中提取函数名

    从表格第二列和标题中提取函数名。

    Args:
        url: 文档页面 URL

    Returns:
        函数名集合
    """
    out_funcs: set[str] = set()
    try:
        response = requests.get(url, timeout=15)
        response.encoding = "utf-8"
    except Exception:
        return out_funcs

    soup = BeautifulSoup(response.text, "html.parser")

    # 方法1：从表格中提取函数名
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) >= 2:
                func_cell = cells[1]
                func_text = func_cell.get_text(strip=True)
                func_name = re.sub(r"\(.*\)$", "", func_text).strip()
                if func_name and func_name not in WEB_FILTER_BLACKLIST:
                    if re.fullmatch(r"[A-Za-z_]\w*", func_name):
                        out_funcs.add(func_name)

    # 方法2：从标题（h2/h3/h4）中提取函数名
    for heading in soup.find_all(["h2", "h3", "h4"]):
        text = heading.get_text(strip=True)
        text = re.sub(r"[\u200b\u200c\u200d\ufeff]+", "", text)
        if text and re.fullmatch(r"[A-Za-z_]\w*", text):
            if text not in WEB_FILTER_BLACKLIST:
                out_funcs.add(text)

    return out_funcs


def func_module_name_from_file(filename: str) -> str:
    """从文件名推断模块名称

    Args:
        filename: 文件名（如 MNActor.d.lua）

    Returns:
        模块名称（如 Actor）
    """
    base = filename.replace(".d.lua", "")
    return base.replace("MN", "", 1) if base.startswith("MN") else base


# ── EnumLibCompare ───────────────────────────────

ENUM_LIB_URL: str = ENUM_URL_20
ENUM_LIB_FILE_PATH: str = str(MULTIPLE_20_DIR / "MNEnumLib.d.lua")
SKIP_CLASSES: set[str] = SKIP_ENUM_CLASSES_20


def enum_analyze_web(url: str) -> dict[str, list[str]]:
    """从 2.0 维基页面中提取枚举定义

    维基页面中的枚举表格格式为：名称 | 数值 | 用法描述
    名称列格式为: ClassName.FieldName

    Args:
        url: 维基页面 URL

    Returns:
        {本地类名: [字段名列表]}
    """
    out_dict: dict[str, list[str]] = {}
    response = requests.get(url, timeout=15)
    response.encoding = "utf-8"
    soup = BeautifulSoup(response.text, "html.parser")
    all_tables: list[Tag] = soup.find_all("table")

    for table in all_tables:
        rows: list[Tag] = table.find_all("tr")
        if not rows:
            continue

        # 找到第一个包含数据的行（跳过表头行）
        first_data_row: Tag | None = None
        for row in rows:
            cells: list[Tag] = row.find_all(["td", "th"])
            if not cells:
                continue
            text = cells[0].get_text(strip=True)
            if text in ("名称", "数据名称", "字符串", ""):
                continue
            first_data_row = row
            break

        if not first_data_row:
            continue

        first_cell: Tag | None = first_data_row.td
        if not first_cell:
            continue

        first_text = first_cell.get_text(strip=True)
        if "." not in first_text:
            continue

        wiki_class_name = first_text.split(".", 1)[0]
        if wiki_class_name in SKIP_CLASSES:
            continue

        current_fields: list[str] = []
        for row in rows:
            field_cell: Tag | None = row.td
            if not field_cell or not field_cell.get_text(strip=True):
                continue
            field_text = field_cell.get_text(strip=True)
            if "." not in field_text:
                continue
            row_class = field_text.split(".", 1)[0]
            if row_class != wiki_class_name:
                continue
            current_fields.append(field_text.split(".", 1)[1])

        # 合并同名类的字段，去重
        if wiki_class_name in out_dict:
            existing = out_dict[wiki_class_name]
            for f in current_fields:
                if f not in existing:
                    existing.append(f)
        else:
            out_dict[wiki_class_name] = current_fields

    return out_dict


# ── EventCompare ─────────────────────────────────

EVENT_URL: str = EVENT_URL_20
JSON_PATH: str = str(MULTIPLE_20_DIR / "MNEvent.d.json")
IGNORE_PARAMS: set[str] = IGNORE_EVENT_PARAMS


def event_load_json(path: str) -> dict[str, dict]:
    """加载本地 MNEvent.d.json，返回 {事件全名: {desc, event_info}}"""
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def event_fetch_page(url: str) -> str | None:
    """请求网页并返回 HTML 文本"""
    try:
        resp = requests.get(url, timeout=20)
        resp.encoding = "utf-8"
        return resp.text
    except Exception:
        return None


def event_parse_web(html: str) -> dict[str, dict]:
    """从网页 HTML 中提取事件定义

    表格列：名称 | 用法描述 | 接口参数 | 参数说明

    Returns:
        {事件全名: {"desc": 用法描述, "params": [参数名列表], "param_desc": {参数名: 说明}}}
    """
    soup = BeautifulSoup(html, "html.parser")
    result: dict[str, dict] = {}

    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 4:
                continue

            name = cells[0].get_text(strip=True)
            usage = cells[1].get_text(strip=True)
            params_raw = cells[2].get_text(strip=True)
            desc_raw = cells[3].get_text(strip=True)

            # 跳过标题行和无效行
            if not name or name in {"名称", "用法描述", "接口参数", "参数说明"}:
                continue
            if not re.fullmatch(r"[A-Za-z0-9_.]+", name):
                continue

            # 解析接口参数
            param_names = [p.strip() for p in params_raw.split(",") if p.strip()]
            desc_parts = [p.strip() for p in desc_raw.split(",") if p.strip()]

            param_desc_map: dict[str, str] = {}
            for i, pn in enumerate(param_names):
                if i < len(desc_parts):
                    param_desc_map[pn] = desc_parts[i]
                else:
                    param_desc_map[pn] = ""

            result[name] = {
                "desc": usage,
                "params": param_names,
                "param_desc": param_desc_map,
            }

    return result
