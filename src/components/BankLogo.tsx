import { useState } from "react";
import { getBankLogoUrl } from "@/lib/bankLogos";
import { Landmark, CreditCard } from "lucide-react";

interface BankLogoProps {
  bankName: string;
  tipo?: string;
  className?: string;
}

export function BankLogo({ bankName, tipo, className = "h-5 w-5" }: BankLogoProps) {
  const logoUrl = getBankLogoUrl(bankName);
  const [error, setError] = useState(false);

  if (logoUrl && !error) {
    return (
      <img
        src={logoUrl}
        alt={bankName}
        className={`${className} rounded-sm object-contain`}
        onError={() => setError(true)}
      />
    );
  }

  // Fallback icon
  if (tipo === "carta_credito") {
    return <CreditCard className={`${className} text-muted-foreground`} />;
  }
  return <Landmark className={`${className} text-muted-foreground`} />;
}
