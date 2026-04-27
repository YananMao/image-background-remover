import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getUserCredits,
  deductCredit,
  logUsage,
  checkDailyLimit,
  ensureUserRecord,
} from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    // 验证用户会话
    const session = await getSession(request.headers.get("cookie"));
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 补录缺失的用户信息（老用户可能没有 users 表记录）
    await ensureUserRecord(session.user);

    const userId = session.user.sub;

    // 检查额度
    const credits = await getUserCredits(userId);
    if (credits.used_credits >= credits.total_credits) {
      return NextResponse.json(
        { error: "quota_exceeded", message: "额度已用完，请升级套餐" },
        { status: 403 }
      );
    }

    // 检查每日限制
    const withinDailyLimit = await checkDailyLimit(userId);
    if (!withinDailyLimit) {
      return NextResponse.json(
        { error: "daily_limit_exceeded", message: "今日处理次数已达上限" },
        { status: 403 }
      );
    }

    // 读取上传的文件
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // 验证文件类型
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 }
      );
    }

    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 10MB)" },
        { status: 400 }
      );
    }

    // 调用 remove.bg API
    const apiKey = process.env.REMOVEBG_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 500 }
      );
    }

    const removeBgForm = new FormData();
    removeBgForm.append("image_file", file);
    removeBgForm.append("size", "auto");

    const removeBgRes = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: removeBgForm,
    });

    if (!removeBgRes.ok) {
      const errorText = await removeBgRes.text();
      console.error("remove.bg API error:", errorText);
      let detail = errorText;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.errors?.[0]?.title) {
          detail = parsed.errors[0].title;
        }
      } catch {
        // 保持原始文本
      }
      return NextResponse.json(
        { error: "抠图失败", detail },
        { status: 502 }
      );
    }

    // 扣减额度并记录日志
    await deductCredit(userId);
    await logUsage(userId, "remove_background");

    // 返回处理后的图片
    const imageBuffer = await removeBgRes.arrayBuffer();
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Remove background error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Internal server error", detail },
      { status: 500 }
    );
  }
}
