import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "请上传图片文件" },
        { status: 400 }
      );
    }

    // 验证文件类型
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "仅支持 JPG、PNG、WebP 格式" },
        { status: 400 }
      );
    }

    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "文件大小不能超过 10MB" },
        { status: 400 }
      );
    }

    // 检查 API Key
    const apiKey = process.env.REMOVEBG_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "服务配置错误：缺少 API Key" },
        { status: 500 }
      );
    }

    // 调用 remove.bg API
    const removeBgFormData = new FormData();
    removeBgFormData.append("image_file", file);
    removeBgFormData.append("size", "auto");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: removeBgFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "处理失败";
      
      if (response.status === 402) {
        errorMessage = "API 配额已用完，请稍后再试";
      } else if (response.status === 403) {
        errorMessage = "API Key 无效";
      } else if (response.status === 429) {
        errorMessage = "请求过于频繁，请稍后再试";
      } else if (response.status === 400) {
        errorMessage = "图片格式不支持或图片损坏";
      }

      console.error("remove.bg API error:", response.status, errorText);
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // 返回处理后的图片
    const imageBuffer = await response.arrayBuffer();
    
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": "attachment; filename=processed.png",
      },
    });

  } catch (error) {
    console.error("Remove background error:", error);
    return NextResponse.json(
      { error: "服务器错误，请稍后再试" },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
export const maxDuration = 30;
