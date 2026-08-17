import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  SupplierQuoteGateway,
  YarnQualityStandards,
} from "../api/contract";

export function QualityStandardsSheet({
  gateway,
  productId,
  productName,
  onClose,
}: {
  gateway: SupplierQuoteGateway;
  productId: string | null;
  productName: string;
  onClose: () => void;
}) {
  const [standards, setStandards] = useState<YarnQualityStandards | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    setStandards(null);
    setError("");
    gateway
      .getYarnQualityStandards(productId, controller.signal)
      .then(setStandards)
      .catch(() => setError("质量标准暂时无法加载，请稍后重试。"));
    return () => controller.abort();
  }, [gateway, productId]);
  return (
    <Sheet
      open={Boolean(productId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[82dvh] rounded-t-xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:left-1/2 sm:max-w-2xl sm:-translate-x-1/2"
      >
        <SheetTitle>纱线质量标准</SheetTitle>
        <SheetDescription className="mt-1">{productName}</SheetDescription>
        {error && <p className="mt-6 text-sm text-rose-700">{error}</p>}
        {!error && !standards && (
          <p className="mt-6 text-sm text-slate-500">正在读取质量指标…</p>
        )}
        {standards && (
          <dl className="mt-5 grid grid-cols-2 gap-x-6 border-t border-slate-200 text-sm sm:grid-cols-3">
            {Object.entries({
              捻度: standards.twist,
              "捻度 CV%": standards.twistCv,
              强力: standards.strength,
              "强力 CV%": standards.strengthCv,
              "条干 CV%": standards.evennessCv,
              细结: standards.thinPlaces,
              粗结: standards.thickPlaces,
              棉结: standards.neps,
              毛羽指数: standards.hairinessIndex,
              异纤根数: standards.foreignFiberCount,
            }).map(([label, value]) => (
              <div key={label} className="border-b border-slate-100 py-3">
                <dt className="text-xs text-slate-400">{label}</dt>
                <dd className="mt-1 font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </SheetContent>
    </Sheet>
  );
}
