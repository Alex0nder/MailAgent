declare module "parse-otp-message" {
  type ParseResult = { code: string; service?: string };
  function parse(message: string): ParseResult | undefined;
  export = parse;
}
