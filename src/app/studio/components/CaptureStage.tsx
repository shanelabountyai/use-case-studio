"use client";

import type { UseCase } from "@/lib/engine";
import { C, btn } from "../theme";
import { AreaIn, Field, PanelShell, SelIn, TextIn } from "./atoms";
import { SaveBar, type StoreStatus } from "./panels";

type TextKey = Exclude<keyof UseCase, "scores" | "weights" | "thresholds">;

export function CaptureStage({ uc, setField, currentId, storeStatus, onSave, onNew, onNext }: {
  uc: UseCase;
  setField: (k: TextKey, v: string) => void;
  currentId: string | null;
  storeStatus: StoreStatus;
  onSave: () => void;
  onNew: () => void;
  onNext: () => void;
}) {
  const set = (k: TextKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setField(k, e.target.value);
  return (
    <div>
      <PanelShell n="01·A" title="The problem">
        <Field label="Use case name"><TextIn value={uc.name} onChange={set("name")} placeholder="e.g. Contract clause triage" /></Field>
        <Field label="Problem / current process" help="What happens today, and what it costs — time, money, error rate. Label estimates as estimates."><AreaIn value={uc.problem} onChange={set("problem")} /></Field>
        <Field label="Cost of the status quo"><TextIn value={uc.currentCost} onChange={set("currentCost")} placeholder="e.g. ≈10 hrs/week (team estimate)" /></Field>
        <Field label="Primary users & their goal"><TextIn value={uc.users} onChange={set("users")} /></Field>
        <Field label="Desired outcome"><AreaIn value={uc.outcome} onChange={set("outcome")} /></Field>
        <Field label="Measurable acceptance bar" help="The most load-bearing field: how you'll know it works. A number, a threshold, a judge."><TextIn value={uc.acceptanceBar} onChange={set("acceptanceBar")} placeholder="e.g. ≥95% accuracy on a 200-item labeled set" /></Field>
      </PanelShell>
      <PanelShell n="01·B" title="Data that exists today">
        <Field label="Sources"><TextIn value={uc.dataSources} onChange={set("dataSources")} placeholder="e.g. SharePoint policy library; AP shared drive" /></Field>
        <div className="grid sm:grid-cols-2 gap-x-5">
          <Field label="Format"><SelIn group="dataFormat" value={uc.dataFormat} onChange={set("dataFormat")} /></Field>
          <Field label="Volume"><SelIn group="dataVolume" value={uc.dataVolume} onChange={set("dataVolume")} /></Field>
          <Field label="Sensitivity"><SelIn group="dataSensitivity" value={uc.dataSensitivity} onChange={set("dataSensitivity")} /></Field>
          <Field label="Freshness"><SelIn group="dataFreshness" value={uc.dataFreshness} onChange={set("dataFreshness")} /></Field>
        </div>
      </PanelShell>
      <PanelShell n="01·C" title="Constraints & shape">
        <div className="grid sm:grid-cols-2 gap-x-5">
          <Field label="Latency requirement"><SelIn group="latency" value={uc.latency} onChange={set("latency")} /></Field>
          <Field label="Human oversight"><SelIn group="oversight" value={uc.oversight} onChange={set("oversight")} /></Field>
          <Field label="Task volume"><SelIn group="taskVolume" value={uc.taskVolume} onChange={set("taskVolume")} /></Field>
          <Field label="Task shape" help="The strongest single signal for architecture."><SelIn group="taskShape" value={uc.taskShape} onChange={set("taskShape")} /></Field>
        </div>
        <Field label="Budget reality"><TextIn value={uc.budget} onChange={set("budget")} /></Field>
        <Field label="Compliance / regulatory constraints"><TextIn value={uc.compliance} onChange={set("compliance")} /></Field>
      </PanelShell>
      <div className="flex justify-between">
        <SaveBar currentId={currentId} storeStatus={storeStatus} onSave={onSave} onNew={onNew} />
        <button onClick={onNext} style={btn(C.blue, "#fff")}>EVALUATE →</button>
      </div>
    </div>
  );
}
