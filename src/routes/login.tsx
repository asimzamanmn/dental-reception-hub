import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Stethoscope, Lock, Mail, ShieldAlert, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — Dental AI Receptionist Console" },
      { name: "description", content: "Sign in or register for the Dental AI Receptionist Console." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // Sign In States
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  // Sign Up States
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");

  // Redirect if already logged in
  if (user) {
    navigate({ to: "/" });
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail || !signInPassword) {
      toast.error("Please enter both email and password.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: signInEmail,
      password: signInPassword,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
    } else {
      toast.success("Welcome back!");
      navigate({ to: "/" });
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpEmail || !signUpPassword) {
      toast.error("Please enter email and password.");
      return;
    }

    setLoading(true);

    try {
      // 1. Check permission securely using the check_email_role RPC function
      const emailLower = signUpEmail.toLowerCase().trim();
      const { data: assignedRole, error: rpcError } = await supabase
        .rpc("check_email_role", { input_email: emailLower });

      if (rpcError) {
        throw new Error(
          "Could not verify your registration permission: " + rpcError.message
        );
      }

      if (!assignedRole) {
        throw new Error(
          "This email is not authorized to register. Please contact an administrator to grant access."
        );
      }

      // 2. Perform signup with the retrieved role metadata
      const { data, error } = await supabase.auth.signUp({
        email: emailLower,
        password: signUpPassword,
        options: {
          data: {
            role: assignedRole,
          },
        },
      });

      if (error) throw error;

      if (data.session) {
        toast.success(`Account created as ${assignedRole.toUpperCase()}! Logged in.`);
        navigate({ to: "/" });
      } else {
        toast.success("Registration successful! Check your email for the confirmation link.");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred during registration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      {/* Background gradients */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-900/30 via-slate-950 to-slate-950" />
      <div className="absolute top-1/4 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Stethoscope className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dental AI Console</h1>
          <p className="text-sm text-slate-400">Manage your reception, bookings, and clinic settings</p>
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-900/60 p-1 border border-slate-800 rounded-lg">
            <TabsTrigger value="signin" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all">
              Sign In
            </TabsTrigger>
            <TabsTrigger value="signup" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all">
              Sign Up
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-4">
            <form onSubmit={handleSignIn}>
              <Card className="border-slate-850 bg-slate-900/50 backdrop-blur-md text-white">
                <CardHeader>
                  <CardTitle className="text-xl">Welcome back</CardTitle>
                  <CardDescription className="text-slate-400">
                    Enter your email and password to access the console.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="doctor@clinic.com"
                        className="pl-10 bg-slate-950/60 border-slate-850 focus:border-primary text-white"
                        value={signInEmail}
                        onChange={(e) => setSignInEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="signin-password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10 bg-slate-950/60 border-slate-850 focus:border-primary text-white"
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full font-semibold" disabled={loading}>
                    {loading ? "Signing In..." : "Sign In"}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-4">
            <form onSubmit={handleSignUp}>
              <Card className="border-slate-850 bg-slate-900/50 backdrop-blur-md text-white">
                <CardHeader>
                  <CardTitle className="text-xl">Create Account</CardTitle>
                  <CardDescription className="text-slate-400">
                    Register a new credentials set for the receptionist panel.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="staff@clinic.com"
                        className="pl-10 bg-slate-950/60 border-slate-850 focus:border-primary text-white"
                        value={signUpEmail}
                        onChange={(e) => setSignUpEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="Choose a password (min 6 chars)"
                        className="pl-10 bg-slate-950/60 border-slate-850 focus:border-primary text-white"
                        value={signUpPassword}
                        onChange={(e) => setSignUpPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full font-semibold" disabled={loading}>
                    {loading ? "Registering..." : "Create Account"}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
