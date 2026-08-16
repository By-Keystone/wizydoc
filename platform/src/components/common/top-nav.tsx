import Image from "next/image";
import logo from "@/images/logo.png";

export const TopNav = () => {
  return (
    <div className="w-full flex items-center gap-x-2 py-4 bg-gray-100 justify-center shadow-lg rounded-b-md">
      <Image src={logo} alt="WizyDoc" className="h-10 w-auto" />
    </div>
  );
};
