import { NextResponse, type NextRequest } from "next/server";
import { documentService } from "@/server/services/document.service";
import { handleApiError } from "@/server/utils/api-response";
import { resolveBusinessId } from "@/server/utils/business-context";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessId = resolveBusinessId();
    const file = await documentService.getDocumentFileForPreview(businessId, id);

    const safeFileName = file.fileName.replace(/["\r\n]/g, "_");
    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${safeFileName}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
