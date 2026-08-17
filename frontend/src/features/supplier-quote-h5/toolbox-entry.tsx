import { SupplierQuoteApp } from "./SupplierQuoteApp";
import { createHttpSupplierQuoteGateway } from "./api/httpGateway";

const gateway = createHttpSupplierQuoteGateway({
  apiBaseUrl: "/api/supplier-quote",
});

export function ToolboxSupplierQuoteEntry() {
  return (
    <SupplierQuoteApp
      gateway={gateway}
      routeBase="/showcase/supplier-quote"
      brandName="织联协同 · 验证环境"
      demo
    />
  );
}
