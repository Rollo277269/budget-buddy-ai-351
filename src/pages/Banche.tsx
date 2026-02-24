import { Landmark } from "lucide-react";

const BanchePage = () => {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Banche</h2>
        <p className="text-sm text-muted-foreground">Sezione in fase di sviluppo</p>
      </div>
      <div className="flex flex-col items-center justify-center h-64 rounded-xl border bg-card text-muted-foreground">
        <Landmark className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm">Nessun dato bancario disponibile</p>
        <p className="text-xs mt-1">Questa sezione sarà disponibile a breve</p>
      </div>
    </div>
  );
};

export default BanchePage;
