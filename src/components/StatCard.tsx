import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  variant: "income" | "expense" | "neutral" | "balance";
}

const variantStyles = {
  income: "bg-income-bg border-income/20",
  expense: "bg-expense-bg border-expense/20",
  neutral: "bg-accent border-border",
  balance: "bg-primary/5 border-primary/20 bg-slate-50",
};

const iconStyles = {
  income: "text-income bg-income/10",
  expense: "text-expense bg-expense/10",
  neutral: "text-muted-foreground bg-muted",
  balance: "text-primary bg-primary/10",
};

const valueStyles = {
  income: "text-income",
  expense: "text-expense",
  neutral: "text-foreground",
  balance: "text-primary",
};

export function StatCard({ title, value, subtitle, icon: Icon, variant }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-5 transition-all hover:shadow-md ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={`text-xl font-bold tracking-tight font-mono ${valueStyles[variant]}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className={`rounded-lg p-2.5 ${iconStyles[variant]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
