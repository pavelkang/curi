"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { QuizBlock as QuizBlockType } from "@/lib/content";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { RadioList } from "@astryxdesign/core/RadioList";
import { RadioListItem } from "@astryxdesign/core/RadioList";
import { cn } from "@/lib/utils";

// MCQ only. Immediate feedback + explanation + unlimited retake.
// Nothing about a quiz gates or locks the next lesson (suggested path only).
export default function QuizBlock({ block }: { block: QuizBlockType }) {
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  if (block.questions.length === 0) {
    return (
      <Card>
        <VStack gap={2}>
          {block.title && <Heading level={3}>{block.title}</Heading>}
          <Text type="supporting">No questions in this quiz yet.</Text>
        </VStack>
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
    <Card>
      <VStack gap={6}>
        <Heading level={3}>{block.title ?? "Quiz"}</Heading>
        {answeredCount > 0 && (
          <Text type="supporting">
            {correctCount} of {answeredCount} correct
          </Text>
        )}
        {block.questions.map((q, qi) => {
          const chosen = answers[q.id] ?? null;
          const isSubmitted = Boolean(submitted[q.id]);
          const isCorrect = isSubmitted && chosen === q.correct_index;
          return (
            <div key={q.id} className="space-y-3">
              <p className="font-semibold leading-snug text-primary">
                <span className="mr-2 text-accent">Q{qi + 1}.</span> {q.prompt}
              </p>
              <RadioList
                label={`Question ${qi + 1}`}
                isLabelHidden
                value={chosen === null ? "" : String(chosen)}
                onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: Number(v) }))}
                isDisabled={isSubmitted}
              >
                {q.options.map((opt, oi) => {
                  const isChosen = chosen === oi;
                  const isAnswer = oi === q.correct_index;
                  return (
                    <RadioListItem
                      key={oi}
                      value={String(oi)}
                      label={opt}
                      endContent={
                        isSubmitted && isAnswer ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
                        ) : isSubmitted && isChosen ? (
                          <XCircle className="h-5 w-5 shrink-0 text-error" aria-hidden />
                        ) : undefined
                      }
                    />
                  );
                })}
              </RadioList>
              {!isSubmitted ? (
                <Button label="Check answer" size="sm" disabled={chosen === null} onClick={() => setSubmitted((s) => ({ ...s, [q.id]: true }))} />
              ) : (
                <div
                  className={cn(
                    "space-y-2 rounded-lg border px-4 py-3",
                    isCorrect ? "border-success bg-success-muted" : "border-error bg-error-muted",
                  )}
                >
                  <p className={cn("flex items-center gap-2 text-sm font-semibold", isCorrect ? "text-success" : "text-error")}>
                    {isCorrect ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
                    {isCorrect
                      ? "Correct"
                      : q.correct_index >= 0
                        ? `Not quite. The correct answer is: ${q.options[q.correct_index]}`
                        : "Not quite. No correct answer was set for this question."}
                  </p>
                  {q.explanation && <Text type="supporting">{q.explanation}</Text>}
                  {/* "Try again" only after a wrong answer — showing it
                      right after a correct one reads as if the answer
                      was wrong. */}
                  {!isCorrect && (
                    <Button
                      label="Try again"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setAnswers((a) => ({ ...a, [q.id]: null }));
                        setSubmitted((s) => ({ ...s, [q.id]: false }));
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div>
          <Button label="Retake quiz" variant="secondary" onClick={reset} />
        </div>
      </VStack>
    </Card>
  );
}
