"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Loader2, Download, RefreshCw, Image as ImageIcon, AlertCircle, LogIn, LogOut, User } from "lucide-react";

type UserInfo = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

type UsageInfo = {
  today: number;
  todayLimit: number;
  month: number;
  monthLimit: number;
};

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  
  // 登录相关状态
  const [user, setUser] = useState<UserInfo | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  // 检查登录状态
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/auth/me`, {
          credentials: "include",
        });
        const data = await response.json() as { user: UserInfo | null; usage: UsageInfo | null };
        if (data.user) {
          setUser(data.user);
          setUsage(data.usage);
        }
      } catch (err) {
        console.error("Failed to check auth:", err);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    checkAuth();
  }, [apiUrl]);

  // 登录
  const handleLogin = () => {
    window.location.href = `${apiUrl}/api/auth/google`;
  };

  // 登出
  const handleLogout = async () => {
    try {
      await fetch(`${apiUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      setUsage(null);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      // 验证文件大小 (10MB)
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
  }, []);

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

    // 检查登录状态
    if (!user) {
      setError("请先登录后再使用抠图功能");
      return;
    }

    // 检查配额
    if (usage && usage.today >= usage.todayLimit) {
      setError("今日使用次数已达上限，请明天再试");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 将 base64 转换为 Blob
      const response = await fetch(originalImage);
      const blob = await response.blob();
      
      const formData = new FormData();
      formData.append("file", blob, "image.png");

      const apiResponse = await fetch(`${apiUrl}/api/remove-background`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json().catch(() => ({})) as { message?: string; error?: string; needLogin?: boolean; quotaExceeded?: boolean };
        
        // 如果需要登录
        if (errorData.needLogin) {
          setError("请先登录后再使用抠图功能");
          return;
        }
        
        // 如果配额超限
        if (errorData.quotaExceeded) {
          setError(errorData.error || "使用次数已达上限");
          return;
        }
        
        throw new Error(errorData.message || errorData.error || "处理失败");
      }

      const resultBlob = await apiResponse.blob();
      const resultUrl = URL.createObjectURL(resultBlob);
      setProcessedImage(resultUrl);
      
      // 更新使用次数
      if (usage) {
        setUsage({
          ...usage,
          today: usage.today + 1,
          month: usage.month + 1,
        });
      }
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

  // 检查 URL 参数中的登录状态
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") === "success") {
      // 清除 URL 参数
      window.history.replaceState({}, "", "/");
      // 重新检查登录状态
      fetch(`${apiUrl}/api/auth/me`, { credentials: "include" })
        .then((res) => res.json())
        .then((data) => {
          const typedData = data as { user: UserInfo | null; usage: UsageInfo | null };
          if (typedData.user) {
            setUser(typedData.user);
            setUsage(typedData.usage);
          }
        });
    } else if (params.get("error")) {
      const errorMsg = params.get("error");
      if (errorMsg === "invalid_state") {
        setError("登录验证失败，请重试");
      } else if (errorMsg === "no_code") {
        setError("登录授权被取消");
      } else {
        setError("登录失败，请重试");
      }
      window.history.replaceState({}, "", "/");
    }
  }, [apiUrl]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div className="text-center flex-1">
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center justify-center gap-2">
              <ImageIcon className="w-10 h-10" />
              Background Remover
            </h1>
            <p className="text-slate-400">一键抠图，简单好用</p>
          </div>
        </div>

        {/* 用户信息栏 */}
        <div className="mb-6 flex justify-end">
          {isCheckingAuth ? (
            <div className="text-slate-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              检查登录状态...
            </div>
          ) : user ? (
            <div className="flex items-center gap-4">
              {/* 使用配额信息 */}
              {usage && (
                <div className="text-sm text-slate-400">
                  今日: <span className={usage.today >= usage.todayLimit ? "text-red-400" : "text-green-400"}>{usage.today}/{usage.todayLimit}</span>
                  {" | "}
                  本月: <span className={usage.month >= usage.monthLimit ? "text-red-400" : "text-green-400"}>{usage.month}/{usage.monthLimit}</span>
                </div>
              )}
              {/* 用户头像和名称 */}
              <div className="flex items-center gap-2 bg-slate-800 rounded-full px-3 py-1.5">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={user.name || "用户头像"}
                    className="w-6 h-6 rounded-full"
                  />
                ) : (
                  <User className="w-5 h-5 text-slate-400" />
                )}
                <span className="text-slate-300 text-sm max-w-[120px] truncate">
                  {user.name || user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="ml-1 p-1 hover:bg-slate-700 rounded-full transition-colors"
                  title="登出"
                >
                  <LogOut className="w-4 h-4 text-slate-400 hover:text-red-400" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Google 登录
            </button>
          )}
        </div>

        {/* 未登录提示 */}
        {!isCheckingAuth && !user && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-xl flex items-center gap-3 text-yellow-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>请先登录后再使用抠图功能，登录后可获得每日 {usage?.todayLimit || 10} 次免费使用额度</span>
          </div>
        )}

        {/* Upload Area */}
        {!originalImage && (
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
              transition-all duration-300 ease-in-out
              ${isDragActive 
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
                <p className="text-sm text-slate-600 mt-4">支持 JPG / PNG / WebP，最大 10MB</p>
              </>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
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
                <p className="text-sm text-slate-400 mb-3 text-center">抠图结果</p>
                <div 
                  className="aspect-square rounded-xl overflow-hidden flex items-center justify-center"
                  style={{
                    backgroundImage: "linear-gradient(45deg, #374151 25%, transparent 25%), linear-gradient(-45deg, #374151 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #374151 75%), linear-gradient(-45deg, transparent 75%, #374151 75%)",
                    backgroundSize: "20px 20px",
                    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                    backgroundColor: "#1f2937"
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
                  disabled={isLoading || !user}
                  className={`
                    px-8 py-3 rounded-xl font-medium flex items-center gap-2
                    transition-all duration-300
                    ${isLoading || !user
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
                  ) : !user ? (
                    <>
                      <LogIn className="w-5 h-5" />
                      请先登录
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
    </main>
  );
}
