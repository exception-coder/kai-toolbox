import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { evaluateTeaching, getTeaching, runTeaching, saveTeaching, type TeachingConfig, type Run, type Evaluation } from "./api";

/** 版本配置与运行请求共享状态，避免视图切换隐式改变执行配置。 */
export function useTeachingAgent() {
  const client = useQueryClient();
  const [version, setVersion] = useState<number>();
  const query = useQuery({ queryKey: ["agent-teaching", version], queryFn: () => getTeaching(version) });
  const [draft, setDraft] = useState<TeachingConfig | null>(null);
  const [result, setResult] = useState<Run | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["agent-teaching"] });
  const save = useMutation({ mutationFn: saveTeaching, onSuccess: snapshot => {
    client.setQueryData(["agent-teaching", snapshot.version], snapshot);
    setVersion(snapshot.version); setDraft(null);
    void client.invalidateQueries({ queryKey: ["agent-management"] });
  } });
  const run = useMutation({ mutationFn: runTeaching, onSuccess: value => { setResult(value); void refresh(); } });
  const evaluate = useMutation({ mutationFn: (mode: "DEMO" | "LIVE") => evaluateTeaching(query.data!.version, mode),
    onSuccess: value => { setEvaluation(value); void refresh(); } });
  const busy = save.isPending || run.isPending || evaluate.isPending;
  const error = query.error ?? save.error ?? run.error ?? evaluate.error;
  return { setVersion, query, draft, setDraft, result, setResult, evaluation, setEvaluation, save, run, evaluate, busy, error };
}
