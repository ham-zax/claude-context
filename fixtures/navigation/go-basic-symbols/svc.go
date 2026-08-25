package svc

type User struct {
  Name string
}

type Runner interface {
  Run() error
}

func add(a, b int) int {
  return a + b
}

type Service struct{}

func (s *Service) Start() error {
  _ = add(1, 2)
  return nil
}
