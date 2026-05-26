import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, Landmark, HelpCircle, FileCode2 } from "lucide-react";
import { useState } from "react";

interface PortaliFiscaliMenuProps {
  tipo: "vendita" | "acquisto";
}

const PORTALI = [
  {
    id: "cassetto",
    label: "Cassetto Fiscale (AdE)",
    desc: "Accesso con SPID / CIE / CNS",
    url: "https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=/agenziaentrate&goto=https%3A%2F%2Fcassettofiscale.agenziaentrate.gov.it%2Fportale%2F",
  },
  {
    id: "fec",
    label: "Fatture e Corrispettivi (AdE)",
    desc: "Consultazione e download XML SdI",
    url: "https://ivaservizi.agenziaentrate.gov.it/portale/",
  },
  {
    id: "wki",
    label: "Fattura Smart (Wolters Kluwer)",
    desc: "Login utente WKI",
    url: "https://www.fatturasmart.it/",
  },
];

export function PortaliFiscaliMenu({ tipo }: PortaliFiscaliMenuProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const tipoLabel = tipo === "vendita" ? "fatture attive" : "fatture passive";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            title="Apri i portali fiscali ufficiali in una nuova scheda"
          >
            <Landmark className="h-3.5 w-3.5" />
            Portali fiscali
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[280px]">
          <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
            Accesso sicuro · {tipoLabel}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PORTALI.map((p) => (
            <DropdownMenuItem
              key={p.id}
              className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
              onClick={() => window.open(p.url, "_blank", "noopener,noreferrer")}
            >
              <div className="flex items-center gap-1.5 w-full">
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium">{p.label}</span>
              </div>
              <span className="text-[10px] text-muted-foreground pl-4">{p.desc}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center gap-1.5 cursor-pointer"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle className="h-3 w-3" />
            <span className="text-xs">Come importare da Fattura Smart</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileCode2 className="h-4 w-4" />
              Importare le fatture da Fattura Smart
            </DialogTitle>
            <DialogDescription className="text-xs">
              Fattura Smart di Wolters Kluwer non espone API pubbliche per integrazioni
              di terze parti. L'aggiornamento avviene tramite export manuale degli XML.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-2.5 text-xs text-foreground list-decimal pl-5">
            <li>
              Accedi a <strong>Fattura Smart</strong> dal menu "Portali fiscali" qui sopra.
            </li>
            <li>
              Vai in <strong>Fatture {tipo === "vendita" ? "Emesse" : "Ricevute"}</strong>
              {" "}e seleziona il periodo di interesse.
            </li>
            <li>
              Usa la funzione <strong>Esporta &rarr; XML (ZIP)</strong> per scaricare
              il pacchetto compresso con tutti i file XML.
            </li>
            <li>
              Estrai lo ZIP sul tuo computer.
            </li>
            <li>
              Trascina i file XML estratti nella zona <strong>"XML"</strong> della
              pagina {tipo === "vendita" ? "Vendite" : "Acquisti"}: l'app riconosce
              ed associa automaticamente le fatture, evitando i duplicati.
            </li>
          </ol>
          <div className="text-[10px] text-muted-foreground border-t pt-2 mt-1">
            In alternativa, dal Cassetto Fiscale / Fatture e Corrispettivi dell'Agenzia
            delle Entrate puoi scaricare lo stesso pacchetto XML direttamente dallo SdI.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}