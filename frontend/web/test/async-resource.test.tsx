import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AsyncResource } from "@/components/async-resource";
import { HealthStatusPanel } from "@/components/health-status-panel";

describe("AsyncResource", () => {
  it("runs immediately and renders success state", async () => {
    const loader = vi.fn().mockResolvedValue({ value: "ready" });

    render(
      <AsyncResource loader={loader}>
        {({ data }) => <div>{data?.value}</div>}
      </AsyncResource>
    );

    expect(screen.getByText("加载中...")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("ready")).toBeInTheDocument();
  });

  it("renders error and retries successfully", async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");

    render(
      <AsyncResource loader={loader}>
        {({ data }) => <div>{data}</div>}
      </AsyncResource>
    );

    expect(await screen.findByText("请求失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("ok")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("renders empty state when data is empty", async () => {
    const loader = vi.fn().mockResolvedValue([]);

    render(
      <AsyncResource loader={loader}>
        {() => <div>should not render</div>}
      </AsyncResource>
    );

    expect(await screen.findByText("暂无数据")).toBeInTheDocument();
  });

  it("keeps only the latest request result when deps change", async () => {
    let resolveSlow!: (value: string) => void;
    let resolveFast!: (value: string) => void;

    const loader = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveSlow = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFast = resolve;
          })
      );

    function Harness({ query }: { query: string }) {
      return (
        <AsyncResource loader={loader} deps={[query]}>
          {({ data }) => <div>{data}</div>}
        </AsyncResource>
      );
    }

    const { rerender } = render(<Harness query="slow" />);
    rerender(<Harness query="fast" />);

    resolveFast("new");
    expect(await screen.findByText("new")).toBeInTheDocument();

    resolveSlow("old");
    await waitFor(() => expect(screen.queryByText("old")).not.toBeInTheDocument());
  });

  it("does not auto run when immediate is false", async () => {
    const loader = vi.fn().mockResolvedValue("manual");

    render(
      <AsyncResource loader={loader} immediate={false}>
        {({ data, run }) => (
          <div>
            <button onClick={() => void run()}>run</button>
            <span>{data}</span>
          </div>
        )}
      </AsyncResource>
    );

    expect(loader).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "run" }));
    expect(await screen.findByText("manual")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe("HealthStatusPanel", () => {
  const formattedAt = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date("2026-06-06T12:00:00.000Z"));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders health data on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            status: "ok",
            postgres: "up",
            redis: "up",
            checkpointer: "memory",
            at: "2026-06-06T12:00:00.000Z"
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    render(<HealthStatusPanel />);

    expect(await screen.findByText("服务状态")).toBeInTheDocument();
    expect(await screen.findByText("memory")).toBeInTheDocument();
    expect(screen.getByText(formattedAt)).toBeInTheDocument();
    expect(screen.getByText(formattedAt)).toHaveAttribute("title", "2026-06-06T12:00:00.000Z");
  });

  it("renders error state and retries", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              status: "ok",
              postgres: "up",
              redis: "down",
              at: "2026-06-06T13:00:00.000Z"
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );

    render(<HealthStatusPanel />);

    expect(await screen.findByText("请求失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("down")).toBeInTheDocument();
  });
});
