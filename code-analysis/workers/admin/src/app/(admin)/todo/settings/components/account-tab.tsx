"use client";

import { User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function AccountTab() {
  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Update your account profile and email address
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Improved Photo Section - Less Boxy */}
            <div className="flex items-center gap-6">
              <Avatar className="size-20">
                <AvatarImage
                  src="https://avatar.vercel.sh/personal"
                  alt="Profile"
                />
                <AvatarFallback>
                  <User className="size-8" />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <div>
                  <p className="text-sm font-medium">Profile Photo</p>
                  <p className="text-muted-foreground text-xs">
                    JPG, PNG or GIF. Max size 2MB.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    Change photo
                  </Button>
                  <Button variant="ghost" size="sm">
                    Remove
                  </Button>
                </div>
              </div>
            </div>

            <Field>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input id="name" defaultValue="Alex Johnson" />
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <Input id="email" type="email" defaultValue="alex@example.com" />
              <FieldDescription>
                We&apos;ll use this email for account notifications
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input id="username" defaultValue="alexjohnson" />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Change your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="current-password">
                Current password
              </FieldLabel>
              <Input id="current-password" type="password" />
            </Field>

            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input id="new-password" type="password" />
            </Field>

            <Field>
              <FieldLabel htmlFor="confirm-password">
                Confirm password
              </FieldLabel>
              <Input id="confirm-password" type="password" />
            </Field>

            <Button className="w-fit">Update password</Button>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions that affect your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete account</p>
              <p className="text-muted-foreground text-sm">
                Permanently delete your account and all data
              </p>
            </div>
            <Button variant="outline" size="sm" className="text-destructive">
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
