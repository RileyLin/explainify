"use client";

import { useState, useRef, useEffect } from "react";

interface EditableTextProps {
  value: string;
  onChange: (newValue: string) => void;
  editable?: boolean;
  className?: string;
  tag?: "h2" | "h3" | "h4" | "p" | "span";
  multiline?: boolean;
}

export function EditableText({
  value,
  onChange,
  editable = false,
  className = "",
  tag: Tag = "span",
  multiline = false,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (!editable) {
    return <Tag className={className}>{value}</Tag>;
  }

  if (isEditing) {
    const handleSave = () => {
      const trimmed = editValue.trim();
      if (trimmed && trimmed !== value) {
        onChange(trimmed);
      } else {
        setEditValue(value);
      }
      setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !multiline) {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        setEditValue(value);
        setIsEditing(false);
      }
    };

    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className={`${className} bg-transparent border border-blue-500 rounded px-1 -mx-1 outline-none resize-none w-full`}
          rows={3}
        />
      );
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`${className} bg-transparent border border-blue-500 rounded px-1 -mx-1 outline-none w-full`}
      />
    );
  }

  return (
    <Tag
      className={`${className} cursor-pointer hover:bg-blue-500/10 hover:outline hover:outline-1 hover:outline-blue-500/30 rounded px-1 -mx-1 transition-all`}
      onClick={() => setIsEditing(true)}
      title="Click to edit"
    >
      {value}
    </Tag>
  );
}
