"use client";

import { useState, useEffect } from "react";
import { X, Check, Zap, Star, Crown, Package, ExternalLink } from "lucide-react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";

interface Plan {
  id: string;
  name: string;
  price: string | null;
  currency: string;
  monthly_credits: number;
  daily_limit: number;
}

interface PayPalConfig {
  clientId: string;
  isSandbox: boolean;
}

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentPlanId?: string;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  basic: <Zap className="w-6 h-6" />,
  pro: <Star className="w-6 h-6" />,
  enterprise: <Crown className="w-6 h-6" />,
  onetime: <Package className="w-6 h-6" />,
};

const PLAN_BADGES: Record<string, string> = {
  pro: "最受欢迎",
};

export default function PricingModal({
  isOpen,
  onClose,
  onSuccess,
  currentPlanId = "free",
}: PricingModalProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [payPalError, setPayPalError] = useState<string | null>(null);
  const [paypalConfig, setPaypalConfig] = useState<PayPalConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // 获取套餐列表
  useEffect(() => {
    if (isOpen) {
      fetch("/api/subscription")
        .then((res) => res.json())
        .then((data) => {
          if (data.plans) {
            const paidPlans = data.plans.filter(
              (p: Plan) => p.id !== "free" && p.price
            );
            setPlans(paidPlans);
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  // 获取 PayPal 配置（动态加载 Client ID）
  useEffect(() => {
    if (isOpen && !paypalConfig && !configLoading) {
      setConfigLoading(true);
      fetch("/api/paypal/config")
        .then((res) => res.json())
        .then((data) => {
          if (data.clientId) {
            setPaypalConfig(data);
          }
        })
        .catch(() => {
          // 获取失败，fallback 到跳转支付
          setPaypalConfig(null);
        })
        .finally(() => setConfigLoading(false));
    }
  }, [isOpen, paypalConfig, configLoading]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setSelectedPlan(null);
      setPayPalError(null);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedPlanData = plans.find((p) => p.id === selectedPlan);

  // 跳转支付模式（fallback）
  const handleRedirectPayment = async () => {
    if (!selectedPlan) return;
    setIsLoading(true);
    setPayPalError(null);
    try {
      const res = await fetch("/api/paypal/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "创建订单失败");
      }
      window.location.href = data.approvalUrl;
    } catch (err) {
      setPayPalError(err instanceof Error ? err.message : "创建订单失败");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-6 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">升级套餐</h2>
              <p className="text-slate-400 text-sm mt-1">
                选择适合您的方案，解锁更多抠图额度
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="p-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const isCurrent = currentPlanId === plan.id;
              const badge = PLAN_BADGES[plan.id];

              return (
                <button
                  key={plan.id}
                  onClick={() => {
                    setSelectedPlan(plan.id);
                    setPayPalError(null);
                  }}
                  disabled={isCurrent}
                  className={`relative text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                    isCurrent
                      ? "border-green-500/50 bg-green-500/5 opacity-60 cursor-not-allowed"
                      : isSelected
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-slate-700 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800"
                  }`}
                >
                  {badge && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-blue-500 text-white text-xs font-medium rounded-full">
                      {badge}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="absolute -top-2 right-2 px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded-full">
                      当前套餐
                    </span>
                  )}

                  <div className="flex items-center gap-2 mb-3 text-slate-300">
                    {PLAN_ICONS[plan.id] ?? <Zap className="w-6 h-6" />}
                    <span className="font-semibold">{plan.name}</span>
                  </div>

                  <div className="mb-3">
                    <span className="text-2xl font-bold text-white">
                      ${plan.price}
                    </span>
                    {plan.id !== "onetime" && (
                      <span className="text-slate-400 text-sm">/月</span>
                    )}
                  </div>

                  <div className="space-y-2 text-sm text-slate-400">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <span>每月 {plan.monthly_credits} 张额度</span>
                    </div>
                    {plan.daily_limit > 0 && (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <span>每日上限 {plan.daily_limit} 张</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <span>
                        约 ${(Number(plan.price) / plan.monthly_credits).toFixed(2)}/张
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* PayPal Checkout */}
          {selectedPlanData && (
            <div className="mt-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
              <p className="text-center text-slate-300 mb-4">
                您选择了 <strong>{selectedPlanData.name}</strong> 套餐，价格{" "}
                <strong>${selectedPlanData.price}</strong>
                {selectedPlanData.id === "onetime" ? "" : "/月"}
              </p>

              {payPalError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
                  {payPalError}
                </div>
              )}

              {configLoading ? (
                <div className="text-center text-slate-400 py-4">
                  加载支付组件中...
                </div>
              ) : paypalConfig ? (
                /* 动态加载 PayPal SDK 按钮 */
                <PayPalScriptProvider
                  options={{
                    clientId: paypalConfig.clientId,
                    currency: "USD",
                    intent: "capture",
                  }}
                >
                  <PayPalButtons
                    style={{
                      layout: "vertical",
                      color: "gold",
                      shape: "rect",
                      label: "paypal",
                    }}
                    disabled={isLoading}
                    createOrder={async () => {
                      setIsLoading(true);
                      setPayPalError(null);
                      try {
                        const res = await fetch("/api/paypal/create-order", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ planId: selectedPlan }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          throw new Error(data.error || "创建订单失败");
                        }
                        return data.id;
                      } catch (err) {
                        setPayPalError(
                          err instanceof Error
                            ? err.message
                            : "创建订单失败"
                        );
                        throw err;
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    onApprove={async (data) => {
                      setIsLoading(true);
                      setPayPalError(null);
                      try {
                        const res = await fetch("/api/paypal/capture-order", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ orderId: data.orderID }),
                        });
                        const result = await res.json();
                        if (!res.ok) {
                          throw new Error(result.error || "支付失败");
                        }
                        onSuccess();
                        onClose();
                      } catch (err) {
                        setPayPalError(
                          err instanceof Error ? err.message : "支付失败"
                        );
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    onError={(err) => {
                      console.error("PayPal error:", err);
                      setPayPalError("PayPal 加载失败，请刷新页面重试");
                    }}
                  />
                </PayPalScriptProvider>
              ) : (
                /* Fallback：跳转支付 */
                <button
                  onClick={handleRedirectPayment}
                  disabled={isLoading}
                  className={`w-full py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-300 ${
                    isLoading
                      ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                >
                  {isLoading ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      创建订单中...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-5 h-5" />
                      前往 PayPal 支付
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
