"""项目全局配置常量

集中管理所有路径、URL、顺序定义和过滤规则。
所有路径基于 PROJECT_ROOT 计算，避免各脚本各自拼接导致不一致。
"""

from pathlib import Path

# 项目根目录（基于本文件位置计算）
# tools/common/config.py → tools/ → 项目根

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent


# 公共目录

TOOLS_DIR: Path = PROJECT_ROOT / "tools"
OUT_DIR: Path = PROJECT_ROOT / "out"

# multiple 声明目录
MULTIPLE_20_DIR: Path = PROJECT_ROOT / "multiple" / "2.0"
MULTIPLE_30_DIR: Path = PROJECT_ROOT / "multiple" / "3.0"

# docs 输出目录
DOCS_20_DIR: Path = PROJECT_ROOT / "docs" / "miniworld-ugc-20" / "references"
DOCS_30_DIR: Path = PROJECT_ROOT / "docs" / "miniworld-ugc-30" / "references"


# 输出文件路径

MERGED_20_FILE: Path = OUT_DIR / "merged.2.0.lua"
MERGED_30_FILE: Path = OUT_DIR / "merged.3.0.lua"
API_20_FILE: Path = DOCS_20_DIR / "API.txt"
API_30_FILE: Path = DOCS_30_DIR / "API.txt"


# 合并顺序定义

ORDER_20: list[str] = [
    "MNEnumLib",  # 枚举库
    "MNGame",  # 游戏
    "MNGameRule",  # 游戏规则
    "MNWorld",  # 世界
    "MNWorldContainer",  # 世界容器
    "MNBlock",  # 方块
    "MNActor",  # 角色
    "MNPlayer",  # 玩家
    "MNCreature",  # 生物
    "MNItem",  # 物品
    "MNBackpack",  # 背包
    "MNArea",  # 区域
    "MNBuff",  # 状态
    "MNChat",  # 聊天
    "MNCustomUI",  # 自定义UI
    "MNUI",  # UI
    "MNGraphics",  # 图形
    "MNTimer",  # 计时器
    "MNTeam",  # 队伍
    "MNObjectLib",  # 对象库
    "MNListenParam",  # 函数监听
    "MNVarLib",  # 变量库
    "MNValuegroup",  # 数值组
    "MNCloudSever",  # 云服数据存储
    "MNDisPlayBoard",  # 显示板
    "MNSpawnport",  # 出生点
    "MNMapMark",  # 小地图
]

ORDER_30: list[str] = [
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


# 2.0 函数对比 URL 映射

FUNC_URLS_20: dict[str, str] = {
    "Actor": "https://dev-wiki.mini1.cn/wiki/673b36183ffc6baf0859d3a0",
    "Area": "https://dev-wiki.mini1.cn/wiki/673b36173ffc6baf0859d38e",
    "Backpack": "https://dev-wiki.mini1.cn/wiki/673b36163ffc6baf0859d384",
    "Block": "https://dev-wiki.mini1.cn/wiki/673b36173ffc6baf0859d38a",
    "Buff": "https://dev-wiki.mini1.cn/wiki/673b36143ffc6baf0859d32f",
    "Chat": "https://dev-wiki.mini1.cn/wiki/673b36163ffc6baf0859d375",
    "CloudSever": "https://dev-wiki.mini1.cn/wiki/673b36153ffc6baf0859d348",
    "Creature": "https://dev-wiki.mini1.cn/wiki/673b36173ffc6baf0859d38d",
    "Customui": "https://dev-wiki.mini1.cn/wiki/673b36173ffc6baf0859d385",
    "DisPlayBoard": "https://dev-wiki.mini1.cn/wiki/673b36153ffc6baf0859d355",
    "Game": "https://dev-wiki.mini1.cn/wiki/673b36173ffc6baf0859d387",
    "GameRule": "https://dev-wiki.mini1.cn/wiki/673b36173ffc6baf0859d389",
    "Graphics": "https://dev-wiki.mini1.cn/wiki/673b36163ffc6baf0859d383",
    "Item": "https://dev-wiki.mini1.cn/wiki/673b36163ffc6baf0859d37b",
    "ListenParam": "https://dev-wiki.mini1.cn/wiki/673b36153ffc6baf0859d373",
    "MapMark": "https://dev-wiki.mini1.cn/wiki/673b36163ffc6baf0859d377",
    "MiniTimer": "https://dev-wiki.mini1.cn/wiki/673b36153ffc6baf0859d36e",
    "ObjectLib": "https://dev-wiki.mini1.cn/wiki/673b36143ffc6baf0859d32b",
    "Player": "https://dev-wiki.mini1.cn/wiki/673b36173ffc6baf0859d39c",
    "Spawnport": "https://dev-wiki.mini1.cn/wiki/673b36163ffc6baf0859d374",
    "Team": "https://dev-wiki.mini1.cn/wiki/673b36163ffc6baf0859d37a",
    "Timer": "https://dev-wiki.mini1.cn/wiki/673b36153ffc6baf0859d36e",
    "UI": "https://dev-wiki.mini1.cn/wiki/673b36173ffc6baf0859d388",
    "ValueGroup": "https://dev-wiki.mini1.cn/wiki/673b36163ffc6baf0859d37f",
    "VarLib": "https://dev-wiki.mini1.cn/wiki/673b36163ffc6baf0859d378",
    "World": "https://dev-wiki.mini1.cn/wiki/673b36173ffc6baf0859d390",
    "WorldContainer": "https://dev-wiki.mini1.cn/wiki/673b36163ffc6baf0859d37d",
}


# 3.0 函数对比 URL 配置

FUNC_URL_30_PREFIX: str = "https://dev-wiki.mini1.cn/ugc-wiki/apis/"  # API 文档前缀
FUNC_URL_30_LIST: list[str] = [  # API 文档列表
    "world.html",
    "gameobject.html",
    "actor.html",
    "player.html",
    "monster.html",
    "block.html",
    "item.html",
    "timeline.html",
    "backpack.html",
    "customui.html",
    "graphics.html",
    "area.html",
    "worldcontainer.html",
    "mod.html",
    "timer.html",
    "buff.html",
    "chat.html",
    "data.html",
    "array.html",
    "table.html",
    "map.html",
]


# 枚举对比 URL

# 2.0 枚举库
ENUM_URL_20: str = "https://dev-wiki.mini1.cn/wiki/673b36183ffc6baf0859d39f"
# 3.0 枚举库
ENUM_URL_30: str = "https://dev-wiki.mini1.cn/ugc-wiki/apis/global.html"


# 事件对比 URL

EVENT_URL_20: str = "https://dev-wiki.mini1.cn/wiki/673b36173ffc6baf0859d391"
TRIGGER_EVENT_URL_30: str = "https://dev-wiki.mini1.cn/ugc-wiki/apis/triggerevent.html"
COMPONENT_EVENT_URL_30: str = "https://dev-wiki.mini1.cn/ugc-wiki/apis/componentevent.html"


# 过滤规则 / 忽略集合


# 2.0 函数对比黑名单（跳过非函数标题行）
WEB_FILTER_BLACKLIST_20: set[str] = {
    "序号",
    "函数名",
    "函数描述",
    "参数及类型",
    "返回值及类型",
    "该方法的主要作用",
    "具体使用案例如下",
}

# 事件参数字段忽略集合（两版本通用）
IGNORE_EVENT_PARAMS: set[str] = {"eventworldid"}

# 2.0 坐标参数组（视为同组共用描述）
COORD_PARAMS: set[str] = {"x", "y", "z"}

# 2.0 枚举跳过类
SKIP_ENUM_CLASSES_20: set[str] = {"BLOCKID"}

# 3.0 Mini 类不报告差异的字段
MINI_FIELDS_30: set[str] = {
    "Block",
    "Bool",
    "Buff",
    "Effect",
    "MobType",
    "Model",
    "Number",
    "Picture",
    "Sound",
    "String",
    "Vec3",
    "Color",
    "Item",
}

# 3.0 函数标题过滤
FUNC_TITLE_FILTER_30: set[str] = {"World", "GameObject"}

# 2.0 函数对比中完全跳过不报告的模块
FUNC_SKIP_MODULES_20: set[str] = {"EnumLib"}

# 2.0 函数对比中跳过特定模块的指定函数
FUNC_SKIP_FUNCS_20: dict[str, set[str]] = {
    "Valuegroup": {"clearNoValueByName"},
}
