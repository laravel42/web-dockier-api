export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface TagWithCount extends Tag {
  projectCount: number;
}
