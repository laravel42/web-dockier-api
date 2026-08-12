"use client";

import {
  ChevronDown,
  Copy,
  Link as LinkIcon,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Smile,
  Trash2,
  User,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from "@/components/emoji-picker";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

import { Todo } from "../../../data/data";

interface TodoDialogCommentsProps {
  localTodo: Todo;
  onUpdate: (todo: Todo) => void;
  setLocalTodo: (todo: Todo) => void;
}

function formatDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return `Today, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
  } else {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
}

export function TodoDialogComments({
  localTodo,
  onUpdate,
  setLocalTodo,
}: TodoDialogCommentsProps) {
  const [newComment, setNewComment] = useState("");
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(
    null,
  );
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [newReactionEmoji, setNewReactionEmoji] = useState<{
    commentId: string;
    emoji: string;
  } | null>(null);

  const handleDeleteComment = (commentId: string) => {
    const updated = {
      ...localTodo,
      comments: localTodo.comments.filter((c) => c.id !== commentId),
    };
    setLocalTodo(updated);
    onUpdate(updated);
    toast.success("Comment deleted");
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleCopyLink = (commentId: string) => {
    const link = `${window.location.href}#comment-${commentId}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copied to clipboard");
  };

  const handleEmojiSelect = (emoji: string, commentId: string) => {
    const updated = {
      ...localTodo,
      comments: localTodo.comments.map((comment) => {
        if (comment.id === commentId) {
          const reactions = comment.reactions || [];
          // Remove any existing reaction from "You" first
          const filteredReactions = reactions.filter((r) => r.author !== "You");
          // Add the new emoji reaction
          filteredReactions.push({ emoji, author: "You" });

          return { ...comment, reactions: filteredReactions };
        }
        return comment;
      }),
    };
    setNewReactionEmoji({ commentId, emoji });
    setLocalTodo(updated);
    onUpdate(updated);
    setSelectedCommentId(null);
    // Clear animation state after animation completes
    setTimeout(() => setNewReactionEmoji(null), 300);
  };

  const handleEmojiToggle = (emoji: string, commentId: string) => {
    const updated = {
      ...localTodo,
      comments: localTodo.comments.map((comment) => {
        if (comment.id === commentId) {
          const reactions = comment.reactions || [];
          // Check if user has already reacted with this emoji
          const userReaction = reactions.find((r) => r.author === "You");

          if (userReaction && userReaction.emoji === emoji) {
            // Same emoji clicked - remove it (deselect)
            const filteredReactions = reactions.filter(
              (r) => r.author !== "You",
            );
            return { ...comment, reactions: filteredReactions };
          } else {
            // Different emoji or no existing reaction - replace or add
            const filteredReactions = reactions.filter(
              (r) => r.author !== "You",
            );
            filteredReactions.push({ emoji, author: "You" });
            return { ...comment, reactions: filteredReactions };
          }
        }
        return comment;
      }),
    };
    setNewReactionEmoji(null);
    setLocalTodo(updated);
    onUpdate(updated);
  };

  const groupReactionsByEmoji = (
    reactions?: Array<{ emoji: string; author: string }>,
  ) => {
    if (!reactions) return [];

    const grouped: { [key: string]: string[] } = {};
    reactions.forEach((reaction) => {
      if (!grouped[reaction.emoji]) {
        grouped[reaction.emoji] = [];
      }
      grouped[reaction.emoji].push(reaction.author);
    });

    return Object.entries(grouped).map(([emoji, authors]) => ({
      emoji,
      authors,
      count: authors.length,
    }));
  };

  return (
    <div className="flex flex-1 flex-col justify-between space-y-4">
      {/* Existing Comments - Accordion */}
      {localTodo.comments.length > 0 && (
        <Accordion
          type="single"
          collapsible
          className="w-full"
          defaultValue="comments"
        >
          <AccordionItem value="comments" className="">
            <AccordionTrigger showChevron={false} className="border-b py-2">
              <div className="flex items-center gap-2">
                <ChevronDown className="text-muted-foreground pointer-events-none size-5 shrink-0 transition-transform duration-200" />
                <h3 className="text-sm">Comments</h3>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="text-muted-foreground size-4" />
                {localTodo.comments.length > 0 && (
                  <span className="bg-muted ml-auto inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium">
                    {localTodo.comments.length}
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-6 p-4">
              {localTodo.comments.map((comment) => (
                <div
                  key={comment.id}
                  id={`comment-${comment.id}`}
                  className="group flex gap-3 transition-colors"
                >
                  <Avatar className="size-7 shrink-0">
                    <AvatarImage
                      src={comment.author.profilePhoto}
                      alt={comment.author.name}
                    />
                    <AvatarFallback className="bg-primary/10">
                      <User className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {comment.author.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <DropdownMenu
                          open={selectedCommentId === comment.id}
                          onOpenChange={(open) => {
                            if (!open) setSelectedCommentId(null);
                          }}
                        >
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "size-7 transition-all duration-200 ease-out",
                                "-translate-x-2 scale-50 opacity-0",
                                "group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100",
                                "group-hover:delay-125",
                                selectedCommentId === comment.id &&
                                  "translate-x-0 scale-100 opacity-100",
                                "hover:bg-muted",
                              )}
                              onClick={() => setSelectedCommentId(comment.id)}
                            >
                              <Smile className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="p-0">
                            <EmojiPicker className="max-h-[326px]">
                              <EmojiPickerSearch placeholder="Search emoji..." />
                              <EmojiPickerContent
                                onClick={(
                                  e: React.MouseEvent<HTMLDivElement>,
                                ) => {
                                  const emoji = (e.target as HTMLElement)
                                    .textContent;
                                  if (emoji) {
                                    handleEmojiSelect(emoji, comment.id);
                                  }
                                }}
                              />
                            </EmojiPicker>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu
                          open={openActionMenuId === comment.id}
                          onOpenChange={(open) => {
                            setOpenActionMenuId(open ? comment.id : null);
                          }}
                        >
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "size-7 transition-all duration-200 ease-out",
                                "-translate-x-2 scale-50 opacity-0",
                                "group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100",
                                "group-hover:delay-75",
                                openActionMenuId === comment.id &&
                                  "translate-x-0 scale-100 opacity-100",
                                "hover:bg-muted",
                              )}
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={() => handleCopyText(comment.text)}
                            >
                              <Copy className="size-4" />
                              Copy text
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleCopyLink(comment.id)}
                            >
                              <LinkIcon className="size-4" />
                              Copy link
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <p className="-mt-1 text-sm">{comment.text}</p>
                    {/* Reactions Display */}
                    {comment.reactions && comment.reactions.length > 0 && (
                      <div className="animate-in fade-in flex flex-wrap gap-2 pt-2 duration-300">
                        {groupReactionsByEmoji(comment.reactions).map(
                          (reaction) => {
                            const hasUserReacted =
                              reaction.authors.includes("You");
                            const isNewReaction =
                              newReactionEmoji?.commentId === comment.id &&
                              newReactionEmoji?.emoji === reaction.emoji;
                            return (
                              <div
                                key={reaction.emoji}
                                className={cn(
                                  `flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[10px] transition-all duration-300 ease-out`,
                                  hasUserReacted
                                    ? "border border-blue-500 bg-blue-50 dark:bg-blue-950"
                                    : "bg-muted hover:bg-muted/70",
                                  isNewReaction
                                    ? "animate-in zoom-in-50 scale-100 opacity-100 duration-300"
                                    : "scale-100 opacity-100",
                                )}
                                title={reaction.authors.join(", ")}
                                onClick={() =>
                                  handleEmojiToggle(reaction.emoji, comment.id)
                                }
                              >
                                <span>{reaction.emoji}</span>
                                {reaction.count > 1 && (
                                  <span
                                    className={`text-xs font-medium ${hasUserReacted ? "text-blue-600 dark:text-blue-300" : "text-muted-foreground"}`}
                                  >
                                    {reaction.count}
                                  </span>
                                )}
                              </div>
                            );
                          },
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Add Comment */}
      <div className="mt-auto flex items-center gap-2">
        <Avatar className="size-7 shrink-0">
          <AvatarImage src="https://avatar.vercel.sh/alex" alt="Your Profile" />
          <AvatarFallback className="bg-primary/10">
            <User className="size-4" />
          </AvatarFallback>
        </Avatar>
        <InputGroup className="flex-1 overflow-hidden rounded-full">
          <InputGroupInput
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newComment.trim()) {
                e.preventDefault();
                const comment = {
                  id: `c-${Date.now()}`,
                  text: newComment,
                  author: {
                    name: "You",
                    profilePhoto: "https://avatar.vercel.sh/alex",
                  },
                  createdAt: new Date(),
                };
                const updated = {
                  ...localTodo,
                  comments: [...localTodo.comments, comment],
                };
                setLocalTodo(updated);
                onUpdate(updated);
                setNewComment("");
                toast.success("Comment added");
              }
            }}
            placeholder="Add a comment..."
            className="text-sm"
          />
          <input
            type="file"
            id="comment-file-upload"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const comment = {
                  id: `c-${Date.now()}`,
                  text: `Attached file: ${file.name}`,
                  author: {
                    name: "You",
                    profilePhoto: "https://avatar.vercel.sh/alex",
                  },
                  createdAt: new Date(),
                };
                const updated = {
                  ...localTodo,
                  comments: [...localTodo.comments, comment],
                };
                setLocalTodo(updated);
                onUpdate(updated);
                e.target.value = "";
              }
            }}
            multiple
          />
          <InputGroupButton
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              document.getElementById("comment-file-upload")?.click();
            }}
            aria-label="Attach file"
            title="Attach a file"
          >
            <Paperclip className="text-muted-foreground size-4" />
          </InputGroupButton>
        </InputGroup>
      </div>
    </div>
  );
}
