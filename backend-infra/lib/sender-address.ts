const SENDER_ADDRESS = /<?([^\s<>@]+@[a-z0-9.-]+)>?$/i;

export const senderAddressOf = (emailFrom: string): string => {
  const sender = SENDER_ADDRESS.exec(emailFrom.trim());
  if (!sender) {
    throw new Error(
      'EMAIL_FROM tiene que terminar en un correo: por ejemplo, "WizyDoc <no-reply@support.wizydoc.app>".',
    );
  }
  return sender[1];
};
