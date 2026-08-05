import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getEmployeeContext } from "@/lib/supabase/employee";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const employee = await getEmployeeContext();
  if (employee) {
    redirect(employee.role === "staff" ? "/dashboard" : "/admin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-xl">Attend</span>
            <span className="font-serif text-xl italic text-primary">Pac</span>
          </div>
          <CardTitle className="mt-4">Set up your organization</CardTitle>
          <CardDescription>
            One more step — this makes you the org admin for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm />
        </CardContent>
      </Card>
    </div>
  );
}
