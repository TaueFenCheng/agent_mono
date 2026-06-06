import asyncio
from typing import Annotated, TypedDict

from agent_core import InMemoryMemoryStore, SkillRegistry, get_thread_checkpoints, list_threads, make_checkpointer
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


class _State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]


async def _reply(state: _State):
    last = state["messages"][-1]
    return {"messages": [AIMessage(content=f"echo:{last.content}")]}


def test_skill_registry_loads_repo_skill():
    registry = SkillRegistry("/Users/tangjiaqiang/code/tangAgent/skills")
    skills = registry.list_skills()
    assert any(skill.name == "engineering-default" for skill in skills)


def test_in_memory_memory_store_round_trip():
    async def run():
        store = InMemoryMemoryStore()
        await store.setup()
        fact = await store.create_fact("thread-1", content="remember this", category="context")
        facts = await store.list_facts("thread-1")
        assert facts[0].id == fact.id
        assert "remember this" in await store.render_prompt_context("thread-1")

    asyncio.run(run())


def test_checkpointer_keeps_multi_turn_thread_history():
    async def run():
        async with make_checkpointer(backend="memory") as checkpointer:
            builder = StateGraph(_State)
            builder.add_node("reply", _reply)
            builder.add_edge(START, "reply")
            builder.add_edge("reply", END)
            graph = builder.compile(checkpointer=checkpointer)

            await graph.ainvoke(
                {"messages": [HumanMessage(content="hello")]},
                config={"configurable": {"thread_id": "thread-1"}},
            )
            await graph.ainvoke(
                {"messages": [HumanMessage(content="again")]},
                config={"configurable": {"thread_id": "thread-1"}},
            )

            threads = await list_threads(checkpointer, limit=10)
            checkpoints = await get_thread_checkpoints(checkpointer, "thread-1")

            assert threads[0]["thread_id"] == "thread-1"
            assert len(checkpoints) >= 2
            assert checkpoints[-1]["values"]["messages"][-1]["content"] == "echo:again"

    asyncio.run(run())
