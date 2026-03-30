import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ className, ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-white group-[.toaster]:text-gray-900 group-[.toaster]:border-gray-200 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-gray-500",
          actionButton: "group-[.toast]:bg-brand group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-gray-100 group-[.toast]:text-gray-900",
          success: "group-[.toaster]:bg-green-50 group-[.toaster]:border-green-200",
          error: "group-[.toaster]:bg-red-50 group-[.toaster]:border-red-200",
          info: "group-[.toaster]:bg-blue-50 group-[.toaster]:border-blue-200",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
