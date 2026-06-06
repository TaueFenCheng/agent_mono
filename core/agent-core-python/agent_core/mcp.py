from __future__ import annotations

import importlib
import importlib.util
import json
import os
from pathlib import Path
from types import ModuleType
from typing import Any

from langchain_core.tools import BaseTool

from .types import McpToolPlugin

_MCP_CACHE: dict[str, list[BaseTool]] = {}


def _load_module(specifier: str) -> ModuleType:
    trimmed = specifier.strip()
    if not trimmed:
        raise ValueError("Empty plugin module specifier")

    path = Path(trimmed)
    if path.exists():
        spec = importlib.util.spec_from_file_location(path.stem, path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Unable to load plugin from path: {trimmed}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    return importlib.import_module(trimmed)


def _as_plugin(value: Any) -> McpToolPlugin | None:
    if value is None:
        return None
    if hasattr(value, "name") and callable(getattr(value, "load_tools", None)):
        return value
    return None


async def load_mcp_plugins_from_env(env_key: str = "AGENT_MCP_PLUGIN_MODULES") -> list[McpToolPlugin]:
    raw = os.getenv(env_key, "")
    plugins: list[McpToolPlugin] = []
    for specifier in [item.strip() for item in raw.split(",") if item.strip()]:
        try:
            module = _load_module(specifier)
            plugin = _as_plugin(getattr(module, "plugin", None)) or _as_plugin(getattr(module, "default", None))
            if plugin is not None:
                plugins.append(plugin)
        except Exception as error:
            print(f"Failed to load MCP plugin '{specifier}': {error}")
    return plugins


def _load_server_config() -> tuple[str, dict[str, Any]] | None:
    raw = os.getenv("AGENT_MCP_SERVERS_JSON")
    path = os.getenv("AGENT_MCP_SERVERS_FILE")
    if raw:
        return raw, json.loads(raw)
    if path:
        content = Path(path).read_text(encoding="utf-8")
        return content, json.loads(content)
    return None


async def load_mcp_tools_from_env() -> list[BaseTool]:
    config_entry = _load_server_config()
    if config_entry is None:
        return []

    cache_key, config = config_entry
    if cache_key in _MCP_CACHE:
        return _MCP_CACHE[cache_key]

    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient
    except ImportError:
        return []

    client = MultiServerMCPClient(config, tool_name_prefix=True)
    tools = await client.get_tools()
    _MCP_CACHE[cache_key] = tools
    return tools
