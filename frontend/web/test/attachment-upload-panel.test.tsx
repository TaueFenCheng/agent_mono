import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AttachmentUploadPanel } from "@/components/attachment-upload-panel";

vi.mock("@intelligent-agent/ui", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>,
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>
}));

const emptyListResponse = {
  code: 0,
  message: "ok",
  data: {
    attachments: []
  }
};

const uploadResponse = {
  code: 0,
  message: "ok",
  data: {
    id: "attachment-1",
    threadId: "thread-1",
    fileName: "总部任务模版导入v6.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 4,
    status: "uploaded",
    parser: null,
    error: null,
    createdAt: "2026-06-15T08:55:15.273Z",
    updatedAt: "2026-06-15T08:55:15.273Z",
    jobId: "job-1",
    jobStatus: "queued"
  }
};

describe("AttachmentUploadPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads immediately after a file is selected", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(emptyListResponse), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(uploadResponse), {
          status: 201,
          headers: { "content-type": "application/json" }
        })
      );

    render(<AttachmentUploadPanel accessToken="token" threadId="thread-1" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "上传" })).not.toBeInTheDocument();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["test"], "总部任务模版导入v6.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, request] = fetchMock.mock.calls[1];
    expect(request).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer token"
      }
    });
    expect(request?.body).toBeInstanceOf(FormData);
    expect((request?.body as FormData).get("file")).toBe(file);
    expect((request?.body as FormData).get("threadId")).toBe("thread-1");
    expect(await screen.findByText("总部任务模版导入v6.xlsx")).toBeInTheDocument();
  });
});
