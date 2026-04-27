"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  Loader2,
  Download,
  RefreshCw,
  Image as ImageIcon,
  AlertCircle,
  LogOut,
  Crown,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import PricingModal from "@/components/pricing-modal";

interface QuotaInfo {
  total: number;
  used: number;
  remaining: number;
  currentPlan: string;
  withinDailyLimit: boolean;
}

export default function Home() {
  const { user, logout } = useAuth();
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [showPricing, setShowPricing] = useState(false);
  const [quotaRefreshing, setQuotaRefreshing] = useState(false);

  // 获取额度信息
  const fetchQuota = useCallback(async () => {
    if (!user) return;
    setQuotaRefreshing(true);
    try {
      const res = await fetch("/api/quota");
      if (res.ok) {
        const data = await res.json();
        setQuota(data);
      }
    } catch (err) {
      console.error("Failed to fetch quota:", err);
    } finally {
      setQuotaRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  // 处理从 PayPal 跳转回来的支付结果
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    const payment = url.searchParams.get("payment");

    if (token && payment === "success") {
      // 清除 URL 参数，避免重复处理
      url.searchParams.delete("token");
      url.searchParams.delete("payment");
      window.history.replaceState({}, "", url.toString());

      setIsLoading(true);
      setError(null);
      fetch("/api/paypal/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: token }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "支付确认失败");
          }
          await fetchQuota();
          setError("🎉 支付成功！额度已更新。");
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "支付确认失败");
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (payment === "cancel") {
      url.searchParams.delete("payment");
      window.history.replaceState({}, "", url.toString());
      setError("支付已取消");
    }
  }, [fetchQuota]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          setError("文件大小不能超过 10MB");
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          setOriginalImage(reader.result as string);
          setProcessedImage(null);
          setError(null);
          setFileName(file.name.replace(/\.[^/.]+$/, ""));
        };
        reader.readAsDataURL(file);
      }
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    maxFiles: 1,
  });

  const removeBackground = async () => {
    if (!originalImage) return;

    // 检查额度
    if (quota && quota.remaining <= 0) {
      setShowPricing(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(originalImage);
      const blob = await response.blob();

      const formData = new FormData();
      formData.append("file", blob, "image.png");

      const apiResponse = await fetch("/api/remove-background", {
        method: "POST",
        body: formData,
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse
          .json()
          .catch(() => ({ message: "处理失败" }));

        // 额度不足，弹出升级窗口
        if (
          apiResponse.status === 403 &&
          errorData.error === "quota_exceeded"
        ) {
          setShowPricing(true);
          throw new Error(errorData.message || "额度已用完");
        }

        // 每日限制
        if (
          apiResponse.status === 403 &&
          errorData.error === "daily_limit_exceeded"
        ) {
          throw new Error(errorData.message || "今日处理次数已达上限");
        }

        throw new Error(errorData.message || errorData.error || "处理失败");
      }

      const resultBlob = await apiResponse.blob();
      const resultUrl = URL.createObjectURL(resultBlob);
      setProcessedImage(resultUrl);

      // 扣减成功后刷新额度
      await fetchQuota();
    } catch (err) {
      setError(err instanceof Error ? err.message : "处理失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadImage = () => {
    if (!processedImage) return;

    const link = document.createElement("a");
    link.href = processedImage;
    link.download = `${fileName || "processed"}-nobg.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const reset = () => {
    setOriginalImage(null);
    setProcessedImage(null);
    setError(null);
    setFileName("");
  };

  const planLabel: Record<string, string> = {
    free: "免费版",
    basic: "基础版",
    pro: "专业版",
    enterprise: "企业版",
    onetime: "按量包",
  };

  const planColor: Record<string, string> = {
    free: "text-slate-400",
    basic: "text-blue-400",
    pro: "text-purple-400",
    enterprise: "text-amber-400",
    onetime: "text-green-400",
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-center flex-1">
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center justify-center gap-2">
              <ImageIcon className="w-10 h-10" />
              Background Remover
            </h1>
            <p className="text-slate-400">一键抠图，简单好用</p>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <img
                src={user.picture}
                alt={user.name}
                className="w-8 h-8 rounded-full"
                referrerPolicy="no-referrer"
              />
              <span className="text-slate-300 text-sm hidden sm:inline">
                {user.name}
              </span>
              <button
                onClick={logout}
                className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                title="退出登录"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Quota Bar */}
        {quota && (
          <div className="mb-6 p-3 bg-slate-800/60 border border-slate-700 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                {quota.currentPlan === "free" ? (
                  <Zap className="w-4 h-4 text-slate-400" />
                ) : (
                  <Crown className="w-4 h-4 text-amber-400" />
                )}
                <span className={`text-sm font-medium ${planColor[quota.currentPlan] || "text-slate-300"}`}>
                  {planLabel[quota.currentPlan] || quota.currentPlan}
                </span>
              </div>
              <div className="h-4 w-px bg-slate-700 hidden sm:block" />
              <div className="text-sm text-slate-400">
                剩余额度：
                <span
                  className={`font-semibold ${
                    quota.remaining <= 3 ? "text-red-400" : "text-white"
                  }`}
                >
                  {quota.remaining}
                </span>
                <span className="text-slate-500"> / {quota.total} 张</span>
              </div>
              {!quota.withinDailyLimit && (
                <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                  今日已达上限
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchQuota}
                disabled={quotaRefreshing}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
              >
                {quotaRefreshing ? "刷新中..." : "刷新"}
              </button>
              <button
                onClick={() => setShowPricing(true)}
                className="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
              >
                升级套餐
              </button>
            </div>
          </div>
        )}

        {/* Upload Area */}
        {!originalImage && (
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
              transition-all duration-300 ease-in-out
              ${
                isDragActive
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-slate-600 hover:border-slate-500 hover:bg-slate-800/50"
              }
            `}
          >
            <input {...getInputProps()} />
            <Upload className="w-16 h-16 mx-auto mb-4 text-slate-500" />
            {isDragActive ? (
              <p className="text-xl text-blue-400">松开鼠标上传图片</p>
            ) : (
              <>
                <p className="text-xl text-slate-300 mb-2">拖拽图片到此处</p>
                <p className="text-slate-500">或点击上传</p>
                <p className="text-sm text-slate-600 mt-4">
                  支持 JPG / PNG / WebP，最大 10MB
                </p>
              </>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            {error.includes("额度") && (
              <button
                onClick={() => setShowPricing(true)}
                className="text-sm px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors font-medium whitespace-nowrap"
              >
                立即升级
              </button>
            )}
          </div>
        )}

        {/* Preview Area */}
        {originalImage && (
          <div className="mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Original Image */}
              <div className="bg-slate-800/50 rounded-2xl p-4">
                <p className="text-sm text-slate-400 mb-3 text-center">原图</p>
                <div className="aspect-square bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={originalImage}
                    alt="原图"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>

              {/* Processed Image */}
              <div className="bg-slate-800/50 rounded-2xl p-4">
                <p className="text-sm text-slate-400 mb-3 text-center">
                  抠图结果
                </p>
                <div
                  className="aspect-square rounded-xl overflow-hidden flex items-center justify-center"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, #374151 25%, transparent 25%), linear-gradient(-45deg, #374151 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #374151 75%), linear-gradient(-45deg, transparent 75%, #374151 75%)",
                    backgroundSize: "20px 20px",
                    backgroundPosition:
                      "0 0, 0 10px, 10px -10px, -10px 0px",
                    backgroundColor: "#1f2937",
                  }}
                >
                  {isLoading ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                      <p className="text-slate-400">处理中...</p>
                    </div>
                  ) : processedImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={processedImage}
                      alt="抠图结果"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <p className="text-slate-500">等待处理</p>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap justify-center gap-4 mt-6">
              {!processedImage ? (
                <button
                  onClick={removeBackground}
                  disabled={isLoading || (quota !== null && quota.remaining <= 0)}
                  className={`
                    px-8 py-3 rounded-xl font-medium flex items-center gap-2
                    transition-all duration-300
                    ${
                      isLoading || (quota !== null && quota.remaining <= 0)
                        ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-500 text-white"
                    }
                  `}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      处理中...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-5 h-5" />
                      去除背景
                    </>
                  )}
                </button>
              ) : (
                <>
                  <button
                    onClick={downloadImage}
                    className="px-8 py-3 rounded-xl font-medium bg-green-600 hover:bg-green-500 text-white flex items-center gap-2 transition-all duration-300"
                  >
                    <Download className="w-5 h-5" />
                    下载 PNG
                  </button>
                  <button
                    onClick={reset}
                    className="px-8 py-3 rounded-xl font-medium bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-2 transition-all duration-300"
                  >
                    <RefreshCw className="w-5 h-5" />
                    重新上传
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-slate-600 text-sm">
          Powered by remove.bg API
        </div>
      </div>

      {/* Pricing Modal */}
      <PricingModal
        isOpen={showPricing}
        onClose={() => setShowPricing(false)}
        onSuccess={() => {
          fetchQuota();
          setError(null);
        }}
        currentPlanId={quota?.currentPlan}
      />
    </main>
  );
}
