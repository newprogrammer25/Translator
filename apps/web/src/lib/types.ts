export interface Language {
  code: string;
  iso: string;
  name: string;
  native: string;
  flag: string;
}

export interface DialogueTurn {
  role: "user" | "assistant";
  content: string;
  translation?: string;
}

export interface CallUtterance {
  id: string;
  speaker: "A" | "B";
  source: string;
  target: string;
  original: string;
  translation: string;
  done: boolean;
  createdAt: number;
}
