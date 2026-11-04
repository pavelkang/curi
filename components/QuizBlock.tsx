"use client";

import { useState } from "react";
import { CheckCircle2, CircleHelp, RotateCcw, XCircle } from "lucide-react";
import type { QuizBlock as QuizBlockType } from "@/lib/content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

// MCQ only. Immediate feedback + explanation + unlimited retake.
// Nothing about a quiz gates or locks the next lesson (suggested path only).
export default function QuizBlock({ block }: { block: QuizBlockType }) {
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  if (block.questions.length === 0) {
    return (
      <Card>
        <CardHeader>
          {block.title && <CardTitle>{block.title}</CardTitle>}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">No questions in this quiz yet.</p>
        </CardContent>
      </Card>
    );
  }

  const reset = () => {
    setAnswers({});
    setSubmitted({});
  };

  const answeredCount = block.questions.filter((q) => submitted[q.id]).length;
  const correctCount = block.questions.filter((q) => submitted[q.id] && answers[q.id] === q.correct_index).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-base-300 bg-secondary">
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleHelp className="h-5 w-5 text-primary" aria-hidden />
          {block.title ?? "Quiz"}
        </CardTitle>
        <Badge variant="secondary">Multiple choice</Badge>
      </CardHeader>
      <CardContent className="space-y-8 pt-6">
        {answeredCount > 0 && (
          <p className="text-sm font-medium text-slate-600">
            {correctCount} of {answeredCount} answered correctly so far — retakes are unlimited.
          </p>
        )}
        {block.questions.map((q, qi) => {
          const chosen = answers[q.id] ?? null;
          const isSubmitted = Boolean(submitted[q.id]);
          const isCorrect = isSubmitted && chosen === q.correct_index;
          return (
            <div key={q.id} className="space-y-3">
              <p className="font-semibold leading-snug text-slate-900">
                <span className="mr-2 text-primary">Q{qi + 1}.</span> {q.prompt}
              </p>
              <RadioGroup
                value={chosen === null ? "" : String(chosen)}
                onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: Number(v) }))}
                disabled={isSubmitted}
                className="space-y-2"
              >
                {q.options.map((opt, oi) => {
                  const isChosen = chosen === oi;
                  const isAnswer = oi === q.correct_index;
                  return (
                    <div
                      key={oi}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors",
                        !isSubmitted && isChosen && "border-primary bg-secondary",
                        !isSubmitted && !isChosen && "border-base-300 bg-white hover:border-primary/40 hover:bg-secondary",
                        isSubmitted && isAnswer && "border-emerald-300 bg-emerald-50",
                        isSubmitted && !isAnswer && isChosen && "border-red-300 bg-red-50",
                        isSubmitted && !isAnswer && !isChosen && "border-base-300 bg-white opacity-70",
                      )}
                    >
                      <RadioGroupItem value={String(oi)} id={`${block.id}-${q.id}-${oi}`} className="mt-1 shrink-0" />
                      <Label htmlFor={`${block.id}-${q.id}-${oi}`} className="flex-1 cursor-pointer font-normal leading-6 text-slate-800">
                        {opt}
                      </Label>
                      {isSubmitted && isAnswer && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />}
                      {isSubmitted && !isAnswer && isChosen && <XCircle className="h-5 w-5 shrink-0 text-red-500" aria-hidden />}
                    </div>
                  );
                })}
              </RadioGroup>
              {!isSubmitted ? (
                <Button size="sm" disabled={chosen === null} onClick={() => setSubmitted((s) => ({ ...s, [q.id]: true }))}>
                  Check answer
                </Button>
              ) : (
                <div className={cn(
                  "space-y-2 rounded-2xl border px-4 py-3",
                  isCorrect ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
                )}>
                  <p className={cn("flex items-center gap-2 text-sm font-semibold", isCorrect ? "text-emerald-800" : "text-red-800")}>
                    {isCorrect ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
                    {isCorrect ? "Correct" : `Not quite. The correct answer is: ${q.options[q.correct_index]}`}
                  </p>
                  {q.explanation && <p className="text-sm leading-relaxed text-slate-600">{q.explanation}</p>}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAnswers((a) => ({ ...a, [q.id]: null }));
                      setSubmitted((s) => ({ ...s, [q.id]: false }));
                    }}
                  >
                    Try again
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        <Button variant="outline" onClick={reset}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Retake quiz
        </Button>
      </CardContent>
    </Card>
  );
}
