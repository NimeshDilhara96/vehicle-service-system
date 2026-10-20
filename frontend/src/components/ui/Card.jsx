function Card({ title, subtitle, children, footer }) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      {(title || subtitle) && (
        <div className="mb-6 text-center">
          {title && <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>}
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
      )}
      {children}
      {footer && <div className="mt-6 text-center text-sm text-gray-500">{footer}</div>}
    </div>
  );
}

export default Card;

