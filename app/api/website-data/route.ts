import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getWebsiteData,
  updateWebsiteDataContent,
  deleteWebsiteData,
} from "@/lib/server/website-db";

const UpdateSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const DeleteSchema = z.object({
  id: z.string(),
});

const QuerySchema = z.object({
  sourceUrl: z.string().optional(),
  sectionName: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = QuerySchema.parse({
      sourceUrl: searchParams.get("sourceUrl") || undefined,
      sectionName: searchParams.get("sectionName") || undefined,
    });

    const data = await getWebsiteData(query.sourceUrl, query.sectionName);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, content, metadata } = UpdateSchema.parse(body);

    const updated = await updateWebsiteDataContent(id, content, metadata);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = DeleteSchema.parse(body);

    await deleteWebsiteData(id);
    return NextResponse.json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
