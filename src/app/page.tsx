"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Loader2, Download, RefreshCw, Image as ImageIcon, AlertCircle } from "lucide-react";

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

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

    setIsLoading(true);
    setError(null);

    try {
      // 将 base64 转换为 Blob
      const response = await fetch(originalImage);
      const blob = await response.blob();
      
      const formData = new FormData();
      formData.append("file", blob, "image.png");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const apiResponse = await fetch(`${apiUrl}/api/remove-background`, {
        method: "POST",
        body: formData,
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json().catch(() => ({ message: "处理失败" }));
        throw new Error(errorData.message || errorData.error || "处理失败");
      }

      const resultBlob = await apiResponse.blob();
      const resultUrl = URL.createObjectURL(resultBlob);
      setProcessedImage(resultUrl);
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center justify-center gap-2">
            <ImageIcon className="w-10 h-10" />
            Background Remover
          </h1>
          <p className="text-slate-400">一键抠图，简单好用</p>
        </div>

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
                  disabled={isLoading}
                  className={`
                    px-8 py-3 rounded-xl font-medium flex items-center gap-2
                    transition-all duration-300
                    ${isLoading 
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
    </main>
  );
}
