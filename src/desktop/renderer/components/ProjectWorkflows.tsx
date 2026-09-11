import "./ProjectWorkflows.css";
import { useEffect, useState, useCallback, useRef } from "react";
import { TopBar } from "./TopBar";
import { useStore } from "../store";
import type { AgentRef, Project } from "../types";

interface WorkflowApi {
  getWorkflow(projectId: string): Promise<Definition | null>;
  saveWorkflow(projectId: string, definition: Definition): Promise<void>;
  startWorkflow(projectId: string, input: string, fixture: boolean): Promise<void>;
  cancelWorkflow(projectId: string): Promise<void>;
  listWorkflowRuns(projectId: string): Promise<Run[]>;
  listArtifacts(projectId: string): Promise<Artifact[]>;
  openArtifact(projectId: string, id: string, mode: "app" | "browser"): Promise<void>;
  updateAgentRuntime(projectId: string, agentId: string, config: { provider: string; model: string; keyEnv: string }): Promise<void>;
}

interface Definition {
  projectManaged?: boolean;
  id: string;
  name: string;
  steps: Array<{ id: string; agentId?: string; tool?: string; ownerId?:string; workflow?: Definition }>;
}

interface Run {
  id: string;
  name: string;
  status: string;
  startedAt: string;
  error?: string;
  parentRunId?: string;
  steps: Array<{ id: string; status: string; agentId?: string }>;
}

interface Artifact {
  id: string;
  title: string;
  kind: string;
  runId: string;
  agentId?: string;
  createdAt: string;
}

export function ProjectWorkflows() {
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const projects = useStore((s) => s.projects);
  const { showView, showToast, refreshProjects } = useStore.getState();
  const selected = projects.find((p) => p.id === selectedProjectId);

  const [tab, setTab] = useState<"workflow" | "runs" | "artifacts" | "settings">("workflow");
  const [workflow, setWorkflow] = useState<Definition | null>(null);
  const [dirty, setDirty] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [error, setError] = useState<string>("");
  const [settingsDirty, setSettingsDirty] = useState<Record<string, { provider: string; model: string; keyEnv: string }>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const workflowApi = api as unknown as WorkflowApi;

  const isBusy = useStore((s) => selectedProjectId && s.runningKeys[selectedProjectId]);

  const loadWorkflow = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const def = await workflowApi.getWorkflow(selectedProjectId);
      setWorkflow(def || { id: "project-workflow", name: "New Workflow", steps: [] });
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }, [selectedProjectId, api]);

  const loadRunsAndArtifacts = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const [r, a] = await Promise.all([workflowApi.listWorkflowRuns(selectedProjectId), workflowApi.listArtifacts(selectedProjectId)]);
      setRuns(r);
      setArtifacts(a);
    } catch (err) {
      setError(String(err));
    }
  }, [selectedProjectId, api]);

  useEffect(() => {
    loadWorkflow();
    loadRunsAndArtifacts();
  }, [selectedProjectId, loadWorkflow, loadRunsAndArtifacts]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadRunsAndArtifacts(), 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadRunsAndArtifacts]);

  if (!selectedProjectId || !selected) {
    return (
      <div className="workflowPanel empty">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("launcher")}>&larr; back</button>
        No project selected. Select a project from the list.
      </div>
    );
  }

  if (!selected.agents.length) {
    return (
      <div className="workflowPanel empty">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        No agents in this project. Add agents to create workflows.
      </div>
    );
  }

  const saveWorkflowDef = async () => {
    if (!selectedProjectId || !workflow) return;
    try {
      setLoading(true);
      await workflowApi.saveWorkflow(selectedProjectId, workflow);
      setDirty(false);
      showToast("Workflow saved");
    } catch (err) {
      setError(String(err));
      showToast(`Error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const startWorkflow = async (fixture: boolean) => {
    if (!selectedProjectId || !workflow) return;
    try {
      setLoading(true);
      await workflowApi.startWorkflow(selectedProjectId, taskInput, fixture);
      setTaskInput("");
      showToast(`Workflow started (${fixture ? "fixture" : "live"})`);
      await loadRunsAndArtifacts();
    } catch (err) {
      setError(String(err));
      showToast(`Error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const cancelWorkflowRun = async () => {
    if (!selectedProjectId) return;
    try {
      await workflowApi.cancelWorkflow(selectedProjectId);
      showToast("Cancellation requested; waiting for the current step to finish");
      await loadRunsAndArtifacts();
    } catch (err) {
      setError(String(err));
      showToast(`Error: ${String(err)}`);
    }
  };

  const saveAgentRuntime = async (agentId: string) => {
    if (!selectedProjectId) return;
    const config = settingsDirty[agentId];
    if (!config) return;
    try {
      await workflowApi.updateAgentRuntime(selectedProjectId, agentId, config);
      setSettingsDirty((d) => {
        const next = { ...d };
        delete next[agentId];
        return next;
      });
      showToast("Agent settings saved");
      await refreshProjects();
    } catch (err) {
      setError(String(err));
      showToast(`Error: ${String(err)}`);
    }
  };

  const updateStep = (stepIdx: number, agentId: string | undefined) => {
    if (!workflow) return;
    const next = { ...workflow, steps: workflow.steps.map((s, i) => i === stepIdx ? { ...s, ...(s.workflow?{workflow:{...s.workflow,steps:[{...s.workflow.steps[0],agentId}]}}:{agentId}) } : s) };
    setWorkflow(next);
    setDirty(true);
  };

  const addStep = (beforeIdx?: number) => {
    if (!workflow) return;
    const newStep = { id: `step-${Date.now()}`, agentId: undefined };
    const steps = beforeIdx !== undefined ? [...workflow.steps.slice(0, beforeIdx), newStep, ...workflow.steps.slice(beforeIdx)] : [...workflow.steps, newStep];
    setWorkflow({ ...workflow, steps });
    setDirty(true);
  };

  const removeStep = (stepIdx: number) => {
    if (!workflow) return;
    setWorkflow({ ...workflow, steps: workflow.steps.filter((_, i) => i !== stepIdx) });
    setDirty(true);
  };

  const moveStep = (from: number, to: number) => {
    if (!workflow || to < 0 || to >= workflow.steps.length) return;
    const steps = [...workflow.steps];
    [steps[from], steps[to]] = [steps[to], steps[from]];
    setWorkflow({ ...workflow, steps });
    setDirty(true);
  };

  return (
    <><TopBar/><div className="workflowPanel" style={{padding:24,maxWidth:1100,margin:"0 auto",overflow:"auto",height:"calc(100vh - 90px)"}}>
      <div className="tabBar">
        <button className="pillBtn ghostBtn mono" onClick={() => showView("room")}>&larr; back</button>
        <button className={`tab ${tab === "workflow" ? "active" : ""}`} onClick={() => setTab("workflow")}>Workflow</button>
        <button className={`tab ${tab === "runs" ? "active" : ""}`} onClick={() => setTab("runs")}>Runs</button>
        <button className={`tab ${tab === "artifacts" ? "active" : ""}`} onClick={() => setTab("artifacts")}>Artifacts</button>
        <button className={`tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>Agent Settings</button>
      </div>

      {error && <div className="errorMsg">{error}</div>}

      {tab === "workflow" && workflow && (
        <div className="tabContent">
          <div className="workflowHeader">
            <input
              className="workflowName"
              type="text"
              readOnly={workflow.projectManaged}
              value={workflow.name}
              onChange={(e) => {
                setWorkflow({ ...workflow, name: e.target.value });
                setDirty(true);
              }}
              placeholder="Workflow name"
            />
            <button className="pillBtn" onClick={saveWorkflowDef} disabled={workflow.projectManaged || !dirty || loading}>
              {loading ? "Saving..." : "Save"}
            </button>
          </div>

          <div className="stepsContainer">
            {workflow.steps.map((step, idx) => (
              <div key={step.id} className="stepRow">{workflow.projectManaged && <span>{step.id}{step.tool ? " · project tool" : ""}</span>}{step.workflow&&<span>Child workflow: {step.workflow.name}</span>}
                <select
                  disabled={workflow.projectManaged}
                  className="stepAgent"
                  value={step.agentId || step.ownerId || step.workflow?.steps[0]?.agentId || ""}
                  onChange={(e) => updateStep(idx, e.target.value || undefined)}
                  aria-label={`Step ${idx + 1} agent`}
                >
                  <option value="">Select agent</option>
                  {selected.agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button className="stepBtn" onClick={() => moveStep(idx, idx - 1)} disabled={workflow.projectManaged || idx === 0} title="Move up">↑</button>
                <button className="stepBtn" onClick={() => moveStep(idx, idx + 1)} disabled={workflow.projectManaged || idx === workflow.steps.length - 1} title="Move down">↓</button>
                <button className="stepBtn" disabled={workflow.projectManaged} onClick={() => removeStep(idx)} title="Remove">✕</button>
              </div>
            ))}
          </div>

          <button className="pillBtn" disabled={workflow.projectManaged} onClick={() => addStep()}>+ Add Step</button>
          <button className="pillBtn" disabled={workflow.projectManaged} onClick={()=>{setWorkflow({...workflow,steps:[...workflow.steps,{id:crypto.randomUUID(),workflow:{id:crypto.randomUUID(),name:"Delegated workflow",steps:[{id:"delegated",agentId:selected.agents[0].id}]}}]});setDirty(true);}}>+ Add Child Workflow</button>
          <p className="dim">Fixture runs use synthetic replies and make no external model calls.</p>

          <div className="taskSection">
            <textarea
              className="taskInput"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Task input..."
              rows={4}
            />
            <div className="buttonRow">
              <button className="pillBtn" onClick={() => startWorkflow(false)} disabled={loading || isBusy || dirty || !taskInput.trim() || !workflow.steps.length}>
                Run
              </button>
              <button className="pillBtn ghostBtn" onClick={() => startWorkflow(true)} disabled={loading || isBusy || !workflow.steps.length}>
                Run Fixture
              </button>
              <button className="pillBtn ghostBtn" onClick={cancelWorkflowRun} disabled={!isBusy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "runs" && (
        <div className="tabContent runsList">
          {runs.length === 0 ? (
            <div className="empty">No workflow runs yet.</div>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="runItem">
                <div className="runHeader">
                  <span className="runName">{run.name}</span>{run.parentRunId&&<span className="dim">Child of {runs.find(parent=>parent.id===run.parentRunId)?.name ?? "parent workflow"}</span>}
                  <span className={`runStatus ${run.status}`}>{run.status}</span>
                </div>
                <span className="mono dim">{new Date(run.startedAt).toLocaleString()}</span>
                {run.error && <div className="errorMsg">{run.error}</div>}
                {run.steps.length > 0 && (
                  <div className="stepsList">
                    {run.steps.map((step) => (
                      <div key={step.id} className="stepStatus">
                        <span>{step.agentId ? (selected.agents.find(a=>a.id===step.agentId)?.name ?? step.agentId) : step.id}</span>
                        <span className={`status ${step.status}`}>{step.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "artifacts" && (
        <div className="tabContent artifactsList">
          {artifacts.length === 0 ? (
            <div className="empty">No artifacts yet.</div>
          ) : (
            artifacts.map((art) => (
              <div key={art.id} className="artifactItem">
                <div className="artifactHeader">
                  <span className="artTitle">{art.title}</span>
                  <span className="artKind">{art.kind}</span>
                </div>
                <span className="mono dim">{new Date(art.createdAt).toLocaleString()}</span>
                <div className="buttonRow">
                  <button className="pillBtn ghostBtn" onClick={() => workflowApi.openArtifact(selectedProjectId!, art.id, "app").catch(e=>setError(String(e)))}>App</button>
                  <button className="pillBtn ghostBtn" onClick={() => workflowApi.openArtifact(selectedProjectId!, art.id, "browser").catch(e=>setError(String(e)))}>Browser</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "settings" && (
        <div className="tabContent settingsTable">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Provider</th>
                <th>Model</th>
                <th>Credential Env</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {selected.agents.map((agent) => {
                const dirty = settingsDirty[agent.id];
                const provider = dirty?.provider ?? agent.provider ?? "inherit";
                const model = dirty?.model ?? agent.model ?? "";
                const keyEnv = dirty?.keyEnv ?? agent.keyEnv ?? "";
                return (
                  <tr key={agent.id}>
                    <td>{agent.name}</td>
                    <td>
                      <select
                        value={provider}
                        onChange={(e) =>
                          setSettingsDirty((d) => ({
                            ...d,
                            [agent.id]: { provider: e.target.value, model, keyEnv },
                          }))
                        }
                      >
                        <option>inherit</option>
                        <option>claude</option>
                        <option>cursor</option>
                        <option>openrouter</option>
                        <option>openai</option>
                        <option>anthropic</option>
                        <option>gemini</option>
                        <option>ollama</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={model}
                        onChange={(e) =>
                          setSettingsDirty((d) => ({
                            ...d,
                            [agent.id]: { provider, model: e.target.value, keyEnv },
                          }))
                        }
                        placeholder="model"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={keyEnv}
                        onChange={(e) =>
                          setSettingsDirty((d) => ({
                            ...d,
                            [agent.id]: { provider, model, keyEnv: e.target.value },
                          }))
                        }
                        placeholder="env var name"
                      />
                    </td>
                    <td>
                      <button
                        className="pillBtn"
                        onClick={() => saveAgentRuntime(agent.id)}
                        disabled={!dirty}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div></>
  );
}


