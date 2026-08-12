import type { Priority } from "../lib/config/priorities";

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Comment {
  id: string;
  text: string;
  author: {
    name: string;
    profilePhoto: string;
  };
  createdAt: Date;
  reactions?: Array<{
    emoji: string;
    author: string;
  }>;
}

export interface Todo {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  projectId: string;
  priority?: Priority;
  dueDate?: Date;
  deadline?: Date;
  labels?: string[];
  reminders?: Date[];
  location?: string;
  starred?: boolean;
  subtasks: Subtask[];
  comments: Comment[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  completedAt?: Date;
}

export interface Project {
  id: string;
  name: string;
  color?: string;
  description?: string;
}

export interface Label {
  id: string;
  name: string;
  color?: string;
}

export const projects: Project[] = [
  {
    id: "personal",
    name: "Personal Tasks 🏠",
    color: "#3b82f6",
  },
  {
    id: "work",
    name: "Work Projects 💼",
    color: "#8b5cf6",
  },
  {
    id: "shopping",
    name: "Shopping List 🛒",
    color: "#10b981",
  },
  {
    id: "fitness",
    name: "Health & Fitness 💪",
    color: "#f59e0b",
  },
  {
    id: "learning",
    name: "Learning Goals 📚",
    color: "#ec4899",
  },
];

export const initialLabels: Label[] = [
  { id: "documentation", name: "documentation", color: "#3b82f6" },
  { id: "urgent", name: "urgent", color: "#ef4444" },
  { id: "code-review", name: "code-review", color: "#8b5cf6" },
  { id: "exercise", name: "exercise", color: "#10b981" },
  { id: "health", name: "health", color: "#f59e0b" },
  { id: "react", name: "react", color: "#06b6d4" },
  { id: "learning", name: "learning", color: "#ec4899" },
];

export const initialTodos: Todo[] = [
  {
    id: "1",
    title: "Complete project documentation",
    description: "Write comprehensive documentation for the new feature",
    completed: false,
    projectId: "work",
    priority: "P1",
    dueDate: new Date(2025, 9, 25),
    deadline: new Date(2025, 9, 30),
    labels: ["documentation", "urgent"],
    starred: true,
    subtasks: [
      { id: "s1", title: "Write API documentation", completed: true },
      { id: "s2", title: "Add code examples", completed: false },
    ],
    comments: [
      {
        id: "c1",
        text: "Need to update the API section",
        author: { name: "You", profilePhoto: "https://avatar.vercel.sh/alex" },
        createdAt: new Date(2025, 9, 21),
      },
      {
        id: "c2",
        text: "Don't forget the examples",
        author: {
          name: "Sarah",
          profilePhoto: "https://avatar.vercel.sh/sarah",
        },
        createdAt: new Date(2025, 9, 22),
      },
    ],
    createdAt: new Date(2025, 9, 15),
    updatedAt: new Date(2025, 9, 20),
  },
  {
    id: "2",
    title: "Review pull requests",
    description: "Review and merge pending pull requests from the team",
    completed: false,
    projectId: "work",
    priority: "P2",
    labels: ["code-review"],
    subtasks: [],
    comments: [],
    createdAt: new Date(2025, 9, 18),
    updatedAt: new Date(2025, 9, 20),
  },
  {
    id: "3",
    title: "Buy groceries",
    description: "Weekly grocery shopping",
    completed: false,
    projectId: "shopping",
    priority: "P3",
    location: "Whole Foods Market",
    subtasks: [],
    comments: [],
    createdAt: new Date(2025, 9, 20),
    updatedAt: new Date(2025, 9, 20),
  },
  {
    id: "4",
    title: "Morning workout routine",
    description: "30 minutes cardio + strength training",
    completed: true,
    projectId: "fitness",
    priority: "P2",
    labels: ["exercise", "health"],
    subtasks: [],
    comments: [],
    createdAt: new Date(2024, 9, 19),
    updatedAt: new Date(2024, 9, 23),
    completedAt: new Date(2024, 9, 23),
  },
  {
    id: "6",
    title: "Review pull request #234",
    description: "Code review for authentication feature",
    completed: true,
    projectId: "work",
    priority: "P2",
    subtasks: [],
    comments: [],
    createdAt: new Date(2024, 9, 22),
    updatedAt: new Date(2024, 9, 23),
    completedAt: new Date(2024, 9, 23, 10, 30),
  },
  {
    id: "7",
    title: "Update project documentation",
    description: "Add API documentation",
    completed: true,
    projectId: "work",
    priority: "P3",
    subtasks: [],
    comments: [],
    createdAt: new Date(2024, 9, 22),
    updatedAt: new Date(2024, 9, 23),
    completedAt: new Date(2024, 9, 23, 14, 15),
  },
  {
    id: "8",
    title: "Fix responsive design issues",
    description: "Mobile layout improvements",
    completed: true,
    projectId: "work",
    priority: "P1",
    subtasks: [],
    comments: [],
    createdAt: new Date(2024, 9, 21),
    updatedAt: new Date(2024, 9, 22),
    completedAt: new Date(2024, 9, 22, 16, 45),
  },
  {
    id: "5",
    title: "Read React documentation",
    description: "Learn about React Server Components",
    completed: false,
    projectId: "learning",
    priority: "P4",
    labels: ["react", "learning"],
    starred: true,
    subtasks: [],
    comments: [],
    createdAt: new Date(2025, 9, 16),
    updatedAt: new Date(2025, 9, 20),
  },
  {
    id: "9",
    title: "Prepare presentation for team meeting",
    description: "Create slides and demo for upcoming sprint review",
    completed: false,
    projectId: "work",
    priority: "P2",
    dueDate: new Date(2025, 10, 5),
    labels: ["urgent"],
    starred: false,
    subtasks: [
      { id: "s3", title: "Create slide deck", completed: false },
      { id: "s4", title: "Prepare demo environment", completed: false },
    ],
    comments: [],
    createdAt: new Date(2025, 9, 30),
    updatedAt: new Date(2025, 9, 30),
  },
  {
    id: "10",
    title: "Plan weekend hiking trip",
    description: "Research trails and book campsite",
    completed: false,
    projectId: "personal",
    priority: "P3",
    dueDate: new Date(2025, 10, 8),
    location: "Mountain Trail Park",
    starred: true,
    subtasks: [
      { id: "s5", title: "Check weather forecast", completed: false },
      { id: "s6", title: "Pack gear", completed: false },
    ],
    comments: [],
    createdAt: new Date(2025, 9, 30),
    updatedAt: new Date(2025, 9, 30),
  },
];
