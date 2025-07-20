
export interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
}

export interface ShuffledQuestion extends Question {
  shuffledOptions: string[];
}

export enum ExamState {
  LOADING,
  READY,
  IN_PROGRESS,
  PRE_SUBMIT,
  FINISHED,
  REVIEW,
}

export interface WelcomeInfo {
  city: string;
  country: string;
  colo: string;
}

export interface ExamStats {
  exams_taken: number;
  exams_passed: number;
  exams_failed: number;
}

export interface SessionData extends ExamStats {
  id: string;
  wrong_question_ids: string; // JSON string from DB
}
