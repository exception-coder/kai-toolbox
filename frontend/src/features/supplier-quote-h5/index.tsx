import { lazy } from "react";
import { ReceiptText } from "lucide-react";
import type { FeatureManifest } from "@/shell/types";

const ToolboxSupplierQuoteEntry = lazy(() =>
  import("./toolbox-entry").then((module) => ({
    default: module.ToolboxSupplierQuoteEntry,
  })),
);

const manifest: FeatureManifest = {
  id: "supplier-quote-h5",
  name: "供应商报价 H5",
  icon: ReceiptText,
  group: "演示",
  description: "微信身份绑定、市场报价待办与移动端供应商报价的独立发布模块",
  order: 91,
  layout: "showcase",
  hideDock: true,
  entry: "/showcase/supplier-quote/market-quotes",
  routes: [
    {
      path: "/showcase/supplier-quote/*",
      element: <ToolboxSupplierQuoteEntry />,
    },
  ],
};

export default manifest;
