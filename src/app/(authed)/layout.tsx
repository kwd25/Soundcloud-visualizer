import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AuthedLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();
	if (!session?.user?.urn) {
		redirect("/");
	}
	return <>{children}</>;
}
