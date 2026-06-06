"use client";

import type { ReactNode } from "react";
import { Button, Card, CardContent } from "@tang-agent/ui";
import { AsyncResourceState, useAsyncResource, type UseAsyncResourceOptions } from "@/lib/use-async-resource";

export interface AsyncResourceProps<T> extends UseAsyncResourceOptions<T> {
  isEmpty?: (data: T) => boolean;
  children: (state: AsyncResourceState<T>) => ReactNode;
  renderLoading?: (state: AsyncResourceState<T>) => ReactNode;
  renderError?: (state: AsyncResourceState<T>) => ReactNode;
  renderEmpty?: (state: AsyncResourceState<T>) => ReactNode;
}

function defaultIsEmpty<T>(data: T): boolean {
  if (data == null) return true;
  if (typeof data === "string") return data.trim().length === 0;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

function DefaultLoading() {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-sm text-foreground/70">加载中...</p>
      </CardContent>
    </Card>
  );
}

function DefaultEmpty() {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-sm text-foreground/70">暂无数据</p>
      </CardContent>
    </Card>
  );
}

function DefaultError<T>({ state }: { state: AsyncResourceState<T> }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 pt-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-red-500 dark:text-red-400">请求失败</p>
          <p className="mt-1 text-xs text-foreground/70">{state.error?.message ?? "unknown error"}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void state.reload()}>
          重试
        </Button>
      </CardContent>
    </Card>
  );
}

export function AsyncResource<T>({
  loader,
  deps,
  immediate = true,
  defaultData,
  isEmpty = defaultIsEmpty,
  renderLoading,
  renderError,
  renderEmpty,
  children
}: AsyncResourceProps<T>) {
  const state = useAsyncResource({
    loader,
    deps,
    immediate,
    defaultData
  });

  if (state.status === "loading") {
    return <>{renderLoading ? renderLoading(state) : <DefaultLoading />}</>;
  }

  if (state.status === "error") {
    return <>{renderError ? renderError(state) : <DefaultError state={state} />}</>;
  }

  if (state.status === "success" && state.data !== undefined && isEmpty(state.data)) {
    return <>{renderEmpty ? renderEmpty(state) : <DefaultEmpty />}</>;
  }

  if (state.status === "idle") {
    return <>{children(state)}</>;
  }

  return <>{children(state)}</>;
}
