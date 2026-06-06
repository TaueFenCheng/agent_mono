import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface AsyncResourceState<T> {
  status: AsyncStatus;
  data?: T;
  error?: Error;
  loading: boolean;
  run: () => Promise<void>;
  reload: () => Promise<void>;
}

export interface UseAsyncResourceOptions<T> {
  loader: () => Promise<T>;
  deps?: DependencyList;
  immediate?: boolean;
  defaultData?: T;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(typeof error === "string" ? error : "unknown error");
}

export function useAsyncResource<T>({
  loader,
  deps = [],
  immediate = true,
  defaultData
}: UseAsyncResourceOptions<T>): AsyncResourceState<T> {
  const loaderRef = useRef(loader);
  const requestIdRef = useRef(0);
  const [status, setStatus] = useState<AsyncStatus>(defaultData === undefined ? "idle" : "success");
  const [data, setData] = useState<T | undefined>(defaultData);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const run = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setError(undefined);

    try {
      const nextData = await loaderRef.current();
      if (requestId !== requestIdRef.current) return;
      setData(nextData);
      setStatus("success");
    } catch (nextError) {
      if (requestId !== requestIdRef.current) return;
      setError(toError(nextError));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!immediate) return;
    void run();
  }, [immediate, run, ...deps]);

  return {
    status,
    data,
    error,
    loading: status === "loading",
    run,
    reload: run
  };
}
